// ── State ─────────────────────────────────────────────────────────────────────

let currentUser = null;
let userLocation = null;
let map = null;
let markers = [];
let userMarker = null;
let allPeople = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function isUrl(str) {
    try { new URL(str); return true; } catch { return false; }
}

function formatDistance(km) {
    if (km < 1) return Math.round(km * 1000) + 'm';
    return km.toFixed(1) + 'km';
}

// ── Modals ───────────────────────────────────────────────────────────────────

function openJoinModal() {
    document.getElementById('join-modal').classList.add('open');
}
function closeJoinModal() {
    document.getElementById('join-modal').classList.remove('open');
}
function openProfileModal(html) {
    document.getElementById('profile-content').innerHTML = html;
    document.getElementById('profile-modal').classList.add('open');
}
function closeProfileModal() {
    document.getElementById('profile-modal').classList.remove('open');
}

// ── Geolocation ──────────────────────────────────────────────────────────────

function startLocationWatch() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        pos => onLocationUpdate(pos), () => {},
        { enableHighAccuracy: true }
    );
    navigator.geolocation.watchPosition(
        pos => onLocationUpdate(pos), () => {},
        { enableHighAccuracy: true, maximumAge: 10000 }
    );
}

function onLocationUpdate(pos) {
    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (map && userMarker) {
        userMarker.setLatLng([userLocation.lat, userLocation.lng]);
    } else if (map && !userMarker) {
        addUserMarker(userLocation.lat, userLocation.lng);
        map.setView([userLocation.lat, userLocation.lng], 16);
    }
    if (currentUser) {
        fetch('/api/update-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, latitude: userLocation.lat, longitude: userLocation.lng }),
        }).catch(() => {});
    }
}

function getLocationPromise() {
    return new Promise(resolve => {
        if (userLocation) return resolve(userLocation);
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            pos => { userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude }; resolve(userLocation); },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    });
}

// ── Loading ──────────────────────────────────────────────────────────────────

const LOADING_STEPS = [
    'Scanning the web...',
    'Searching LinkedIn and social profiles...',
    'Reading publications and projects...',
    'Analyzing GitHub and portfolios...',
    'Building your professional profile...',
];

function showLoading(name) {
    const el = document.getElementById('loading');
    document.getElementById('loading-title').textContent = 'RESEARCHING ' + name.toUpperCase();
    el.classList.add('open');
    let step = 0;
    const stepEl = document.getElementById('loading-step');
    stepEl.textContent = LOADING_STEPS[0];
    el._interval = setInterval(() => {
        step++;
        if (step < LOADING_STEPS.length) {
            stepEl.style.animation = 'none';
            stepEl.offsetHeight;
            stepEl.style.animation = '';
            stepEl.textContent = LOADING_STEPS[step];
        }
    }, 2500);
}

function hideLoading() {
    const el = document.getElementById('loading');
    clearInterval(el._interval);
    el.classList.remove('open');
}

// ── Map ──────────────────────────────────────────────────────────────────────

function initMap() {
    if (map) return;
    const center = userLocation ? [userLocation.lat, userLocation.lng] : [59.437, 24.7536];
    map = L.map('map', { center, zoom: userLocation ? 16 : 14, zoomControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri', maxZoom: 19,
    }).addTo(map);
    if (userLocation) addUserMarker(userLocation.lat, userLocation.lng);
    loadPeople();
}

function addUserMarker(lat, lng) {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'user-marker',
            html: '<div class="user-dot"></div><div class="user-label">YOU</div>',
            iconSize: [16, 16], iconAnchor: [8, 8],
        }),
        zIndexOffset: 1000,
    }).addTo(map);
}

function addPersonMarker(person) {
    const lat = person.latitude, lng = person.longitude;
    if (!lat || !lng) return null;
    const marker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'person-marker',
            html: '<div class="marker-dot" id="dot-' + esc(person.id) + '"></div><div class="marker-label">' + esc(person.name) + '</div>',
            iconSize: [12, 12], iconAnchor: [6, 6],
        }),
    }).addTo(map);
    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        highlightPerson(person.id);
        viewPerson(person.id);
    });
    markers.push(marker);
    return marker;
}

function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
}

// ── Load + render people ────────────────────────────────────────────────────

async function loadPeople() {
    const lat = userLocation ? userLocation.lat : 59.437;
    const lng = userLocation ? userLocation.lng : 24.7536;

    try {
        let resp = await fetch('/api/nearby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude: lat, longitude: lng, radius_km: 2 }),
        });
        let data = await resp.json();

        // Fallback: load all people if none nearby
        if (data.people.length === 0) {
            resp = await fetch('/api/nearby', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude: lat, longitude: lng, radius_km: 50000 }),
            });
            data = await resp.json();
        }

        allPeople = data.people;
        renderList(allPeople);
        renderMarkers(allPeople);
    } catch (err) {
        console.error(err);
    }
}

function renderMarkers(people) {
    if (!map) return;
    clearMarkers();
    people.forEach(p => addPersonMarker(p));
    if (markers.length > 0) {
        const group = L.featureGroup(markers);
        if (userMarker) group.addLayer(userMarker);
        map.fitBounds(group.getBounds().pad(0.3));
    }
}

function renderList(people) {
    const list = document.getElementById('people-list');
    const empty = document.getElementById('list-empty');
    const count = document.getElementById('people-count');

    if (people.length === 0) {
        list.innerHTML = '';
        list.appendChild(empty);
        empty.style.display = 'block';
        count.textContent = 'PEOPLE';
        return;
    }

    empty.style.display = 'none';
    count.textContent = people.length + ' PEOPLE';

    list.innerHTML = people.map(p => {
        const prof = p.profile;
        const tagsHtml = (prof.tags || []).slice(0, 3)
            .map(t => '<span class="tag">' + esc(t) + '</span>').join('');

        return '<div class="person-row" data-id="' + esc(p.id) + '" onclick="onPersonClick(\'' + esc(p.id) + '\')">' +
            '<div class="avatar-sm">' + esc(p.name)[0] + '</div>' +
            '<div class="person-info">' +
            '<div class="person-name">' + esc(p.name) + '</div>' +
            '<div class="person-role">' + esc(prof.current_role || '') + '</div>' +
            (tagsHtml ? '<div class="person-tags">' + tagsHtml + '</div>' : '') +
            '</div>' +
            (p.distance_km !== undefined ? '<div class="person-dist">' + formatDistance(p.distance_km) + '</div>' : '') +
            '</div>';
    }).join('');
}

function onPersonClick(id) {
    highlightPerson(id);

    // Pan map to person
    const person = allPeople.find(p => p.id === id);
    if (person && person.latitude && person.longitude && map) {
        map.setView([person.latitude, person.longitude], 17);
    }

    viewPerson(id);
}

function highlightPerson(id) {
    // Highlight list row
    document.querySelectorAll('.person-row').forEach(r => r.classList.remove('active'));
    const row = document.querySelector('.person-row[data-id="' + id + '"]');
    if (row) {
        row.classList.add('active');
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Highlight map marker
    document.querySelectorAll('.marker-dot').forEach(d => d.classList.remove('highlighted'));
    const dot = document.getElementById('dot-' + id);
    if (dot) dot.classList.add('highlighted');
}

// ── Search ──────────────────────────────────────────────────────────────────

async function handleSearch(query) {
    if (!query.trim()) {
        renderList(allPeople);
        renderMarkers(allPeople);
        return;
    }

    try {
        const resp = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });
        const data = await resp.json();
        renderList(data.people);
        renderMarkers(data.people);

        const count = document.getElementById('people-count');
        count.textContent = data.people.length + ' RESULTS';
    } catch (err) {
        console.error(err);
    }
}

// ── Join ─────────────────────────────────────────────────────────────────────

async function handleJoin(e) {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const bio = document.getElementById('bio').value.trim();

    if (!document.getElementById('terms').checked) {
        alert('Please accept the terms to continue.');
        return;
    }

    closeJoinModal();
    showLoading(name);
    await getLocationPromise();

    try {
        const resp = await fetch('/api/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, email, bio,
                latitude: userLocation?.lat ?? null,
                longitude: userLocation?.lng ?? null,
            }),
        });
        if (!resp.ok) throw new Error('Server error');
        const data = await resp.json();
        currentUser = data;
        localStorage.setItem('nearby_user', JSON.stringify(data));
        hideLoading();
        openProfileModal(renderProfileHTML(data, true));
        loadPeople();
    } catch (err) {
        hideLoading();
        alert('Error joining. Please try again.');
        console.error(err);
    }
}

// ── Render Profile ──────────────────────────────────────────────────────────

function renderProfileHTML(data, showQR) {
    const p = data.profile;
    let html = '<div class="profile-header">';
    html += '<div class="avatar">' + esc(data.name)[0] + '</div>';
    html += '<h1>' + esc(data.name) + '</h1>';
    if (p.current_role) html += '<p class="role">' + esc(p.current_role) + '</p>';
    html += '</div>';
    if (p.summary) html += '<div class="card"><h3>Summary</h3><p>' + esc(p.summary) + '</p></div>';
    if (p.career && p.career !== 'Unknown') html += '<div class="card"><h3>Career</h3><p>' + esc(p.career) + '</p></div>';
    if (p.education && p.education !== 'Unknown') html += '<div class="card"><h3>Education</h3><p>' + esc(p.education) + '</p></div>';
    if (p.achievements?.length) {
        html += '<div class="card"><h3>Achievements</h3><ul>' + p.achievements.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></div>';
    }
    if (p.interests?.length) {
        html += '<div class="card"><h3>Interests</h3><div class="tags">' + p.interests.map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div></div>';
    }
    if (p.goals?.length) {
        html += '<div class="card"><h3>Goals</h3><div class="tags">' + p.goals.map(t => '<span class="tag tag-green">' + esc(t) + '</span>').join('') + '</div></div>';
    }
    if (p.tags?.length) {
        html += '<div class="card"><h3>Keywords</h3><div class="tags">' + p.tags.map(t => '<span class="tag tag-dim">' + esc(t) + '</span>').join('') + '</div></div>';
    }
    if (p.social_links?.length) {
        const validLinks = p.social_links.filter(isUrl);
        if (validLinks.length) {
            html += '<div class="card"><h3>Links</h3><ul>' + validLinks.map(l => '<li><a href="' + esc(l) + '" target="_blank" rel="noopener noreferrer">' + esc(l) + '</a></li>').join('') + '</ul></div>';
        }
    }
    if (showQR && data.qr_code) {
        html += '<div class="card qr-card"><h3>Your QR Code</h3><p class="text-dim">Scan to view profile</p><img src="data:image/png;base64,' + data.qr_code + '" alt="QR Code" class="qr-img"></div>';
    }
    return html;
}

// ── View Person ─────────────────────────────────────────────────────────────

async function viewPerson(id) {
    try {
        const resp = await fetch('/api/profile/' + id);
        if (!resp.ok) throw new Error('Not found');
        const data = await resp.json();
        openProfileModal(renderProfileHTML(data, false));
    } catch (err) {
        console.error(err);
    }
}

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const match = location.pathname.match(/^\/profile\/(.+)$/);
    if (match) viewPerson(match[1]);

    const saved = localStorage.getItem('nearby_user');
    if (saved) {
        try { currentUser = JSON.parse(saved); } catch { localStorage.removeItem('nearby_user'); }
    }

    document.getElementById('join-form').addEventListener('submit', handleJoin);

    let searchTimeout;
    document.getElementById('search-input').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => handleSearch(e.target.value), 300);
    });

    startLocationWatch();
    setTimeout(initMap, 100);
});
