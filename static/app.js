// ── State ─────────────────────────────────────────────────────────────────────

let currentUser = null;
let userLocation = null;
let map = null;
let markers = [];
let userMarker = null;

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
        pos => onLocationUpdate(pos),
        () => {},
        { enableHighAccuracy: true }
    );

    navigator.geolocation.watchPosition(
        pos => onLocationUpdate(pos),
        () => {},
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
            body: JSON.stringify({
                user_id: currentUser.id,
                latitude: userLocation.lat,
                longitude: userLocation.lng,
            }),
        }).catch(() => {});
    }
}

function getLocationPromise() {
    return new Promise(resolve => {
        if (userLocation) return resolve(userLocation);
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            pos => {
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                resolve(userLocation);
            },
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

    map = L.map('map', {
        center: center,
        zoom: userLocation ? 16 : 14,
        zoomControl: true,
    });

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
    }).addTo(map);

    if (userLocation) {
        addUserMarker(userLocation.lat, userLocation.lng);
    }

    // Close panel when clicking empty map
    map.on('click', () => closePanel());

    loadPeopleOnMap();
}

function addUserMarker(lat, lng) {
    if (userMarker) map.removeLayer(userMarker);

    const icon = L.divIcon({
        className: 'user-marker',
        html: '<div class="user-dot"></div><div class="user-label">YOU</div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });

    userMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 1000 }).addTo(map);
}

function addPersonMarker(person) {
    const lat = person.latitude || person.lat;
    const lng = person.longitude || person.lng;
    if (!lat || !lng) return null;

    const icon = L.divIcon({
        className: 'person-marker',
        html: '<div class="marker-dot" id="dot-' + esc(person.id) + '"></div><div class="marker-label">' + esc(person.name) + '</div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
    });

    const marker = L.marker([lat, lng], { icon: icon }).addTo(map);
    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        openPersonPanel(person);
    });
    markers.push(marker);
    return marker;
}

function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
}

// ── Load people ─────────────────────────────────────────────────────────────

async function loadPeopleOnMap() {
    if (!map) return;

    const lat = userLocation ? userLocation.lat : 59.437;
    const lng = userLocation ? userLocation.lng : 24.7536;

    try {
        // Try nearby first (2km)
        let resp = await fetch('/api/nearby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude: lat, longitude: lng, radius_km: 2 }),
        });
        let data = await resp.json();

        // Fallback: if nobody nearby, load everyone on the planet
        if (data.people.length === 0) {
            resp = await fetch('/api/nearby', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude: lat, longitude: lng, radius_km: 50000 }),
            });
            data = await resp.json();
        }

        clearMarkers();
        data.people.forEach(p => addPersonMarker(p));

        if (markers.length > 0) {
            const group = L.featureGroup(markers);
            if (userMarker) group.addLayer(userMarker);
            map.fitBounds(group.getBounds().pad(0.3));
        }

        const countEl = document.getElementById('people-count');
        if (data.people.length > 0) {
            countEl.textContent = data.people.length + ' PEOPLE';
            countEl.style.display = 'block';
        } else {
            countEl.textContent = 'NO PEOPLE YET';
            countEl.style.display = 'block';
        }

        // Show hint if empty
        removeHint();
        if (data.people.length === 0) {
            showEmptyHint();
        }
    } catch (err) {
        console.error(err);
    }
}

function showEmptyHint() {
    if (document.getElementById('empty-hint')) return;
    const hint = document.createElement('div');
    hint.id = 'empty-hint';
    hint.className = 'empty-hint';
    hint.innerHTML = '<p>No one here yet</p><p class="hint-sub">Tap ADD PERSON to be the first</p>';
    document.getElementById('map').parentElement.appendChild(hint);
}

function removeHint() {
    const h = document.getElementById('empty-hint');
    if (h) h.remove();
}

// ── Panel ───────────────────────────────────────────────────────────────────

function openPersonPanel(person) {
    const panel = document.getElementById('map-panel');
    const p = person.profile;

    document.getElementById('panel-content').innerHTML =
        '<div class="panel-person">' +
        '<div class="person-header">' +
        '<div class="avatar-sm">' + esc(person.name)[0] + '</div>' +
        '<div><h3>' + esc(person.name) + '</h3>' +
        '<p class="role">' + esc(p.current_role || '') + '</p></div>' +
        (person.distance_km !== undefined ? '<span class="distance">' + formatDistance(person.distance_km) + '</span>' : '') +
        '</div>' +
        '<p class="summary">' + esc(p.summary || '') + '</p>' +
        (p.tags?.length ? '<div class="tags" style="margin-bottom:16px">' +
            p.tags.slice(0, 6).map(t => '<span class="tag tag-sm">' + esc(t) + '</span>').join('') +
            '</div>' : '') +
        '<button class="btn-view" onclick="viewPerson(\'' + esc(person.id) + '\')">VIEW FULL PROFILE</button>' +
        '</div>';

    panel.classList.add('open');

    document.querySelectorAll('.marker-dot').forEach(d => d.classList.remove('highlighted'));
    const dot = document.getElementById('dot-' + person.id);
    if (dot) dot.classList.add('highlighted');

    const lat = person.latitude || person.lat;
    const lng = person.longitude || person.lng;
    if (lat && lng) map.panTo([lat, lng]);
}

function closePanel() {
    document.getElementById('map-panel').classList.remove('open');
    document.querySelectorAll('.marker-dot').forEach(d => d.classList.remove('highlighted'));
}

// ── Search ──────────────────────────────────────────────────────────────────

async function handleSearch(query) {
    if (!query.trim()) {
        closePanel();
        loadPeopleOnMap();
        return;
    }

    try {
        const resp = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });
        const data = await resp.json();

        if (!data.people.length) {
            document.getElementById('panel-content').innerHTML =
                '<p class="panel-hint">No results for "' + esc(query) + '"</p>';
            document.getElementById('map-panel').classList.add('open');
            return;
        }

        clearMarkers();
        data.people.forEach(p => addPersonMarker(p));

        if (markers.length > 0) {
            map.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
        }

        let html = '<div class="search-results">';
        data.people.forEach(p => {
            html += '<div class="search-result" onclick="viewPerson(\'' + esc(p.id) + '\')">' +
                '<div class="avatar-sm">' + esc(p.name)[0] + '</div>' +
                '<div><h4>' + esc(p.name) + '</h4>' +
                '<p class="role">' + esc(p.profile.current_role || '') + '</p></div>' +
                '</div>';
        });
        html += '</div>';
        document.getElementById('panel-content').innerHTML = html;
        document.getElementById('map-panel').classList.add('open');

        document.querySelectorAll('.marker-dot').forEach(d => d.classList.add('highlighted'));

        const countEl = document.getElementById('people-count');
        countEl.textContent = data.people.length + ' FOUND';
        countEl.style.display = 'block';
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

        // Show profile in modal
        openProfileModal(renderProfileHTML(data, true));

        // Reload map with new person
        loadPeopleOnMap();
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
        html += '<div class="card"><h3>Achievements</h3><ul>' +
            p.achievements.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></div>';
    }
    if (p.interests?.length) {
        html += '<div class="card"><h3>Interests</h3><div class="tags">' +
            p.interests.map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div></div>';
    }
    if (p.goals?.length) {
        html += '<div class="card"><h3>Goals</h3><div class="tags">' +
            p.goals.map(t => '<span class="tag tag-green">' + esc(t) + '</span>').join('') + '</div></div>';
    }
    if (p.tags?.length) {
        html += '<div class="card"><h3>Keywords</h3><div class="tags">' +
            p.tags.map(t => '<span class="tag tag-dim">' + esc(t) + '</span>').join('') + '</div></div>';
    }
    if (p.social_links?.length) {
        const validLinks = p.social_links.filter(isUrl);
        if (validLinks.length) {
            html += '<div class="card"><h3>Links</h3><ul>' +
                validLinks.map(l => '<li><a href="' + esc(l) + '" target="_blank" rel="noopener noreferrer">' + esc(l) + '</a></li>').join('') +
                '</ul></div>';
        }
    }
    if (showQR && data.qr_code) {
        html += '<div class="card qr-card"><h3>Your QR Code</h3>' +
            '<p class="text-dim">Scan to view profile</p>' +
            '<img src="data:image/png;base64,' + data.qr_code + '" alt="QR Code" class="qr-img"></div>';
    }
    return html;
}

// ── View Person ─────────────────────────────────────────────────────────────

async function viewPerson(id) {
    try {
        const resp = await fetch('/api/profile/' + id);
        if (!resp.ok) throw new Error('Not found');
        const data = await resp.json();
        closePanel();
        openProfileModal(renderProfileHTML(data, false));
    } catch (err) {
        console.error(err);
    }
}

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Check URL for QR scan profile link
    const match = location.pathname.match(/^\/profile\/(.+)$/);
    if (match) {
        viewPerson(match[1]);
    }

    // Restore session
    const saved = localStorage.getItem('nearby_user');
    if (saved) {
        try { currentUser = JSON.parse(saved); } catch { localStorage.removeItem('nearby_user'); }
    }

    // Form
    document.getElementById('join-form').addEventListener('submit', handleJoin);

    // Search
    let searchTimeout;
    document.getElementById('search-input').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => handleSearch(e.target.value), 300);
    });

    // Start GPS + map
    startLocationWatch();
    setTimeout(initMap, 100);
});
