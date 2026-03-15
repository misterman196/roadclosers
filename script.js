// Initialize map centered on Northern Ireland
const niCenter = [54.7877, -6.4923];
const niBounds = [
    [54.0, -8.3], // Southwest
    [55.4, -5.3]  // Northeast
];

const map = L.map('map', {
    center: niCenter,
    zoom: 9,
    minZoom: 7,
    maxBounds: niBounds,
    maxBoundsViscosity: 1.0
});

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Feature group to store marked roads
const markedRoads = new L.FeatureGroup();
map.addLayer(markedRoads);

const loadingIndicator = document.getElementById('loading');

// Fetch road data from Overpass API near a click coordinate
async function fetchRoadAt(lat, lng) {
    if (loadingIndicator.style.display === 'block') return; // Prevent multiple simultaneous requests
    
    loadingIndicator.style.display = 'block';
    console.log(`Fetching road data for ${lat}, ${lng}...`);
    
    // Search radius in meters
    const radius = 20; 
    
    // Overpass QL query to find the nearest highway
    const query = `
        [out:json][timeout:15];
        way(around:${radius},${lat},${lng})["highway"];
        out geom;
    `;
    
    // List of common Overpass API endpoints to use as fallbacks
    const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
    ];
    
    let fetched = false;

    for (const baseUrl of endpoints) {
        if (fetched) break;
        
        const url = baseUrl + '?data=' + encodeURIComponent(query);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout for each attempt

        try {
            console.log(`Trying ${baseUrl}...`);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`${baseUrl} returned status ${response.status}`);
                continue;
            }

            const data = await response.json();
            console.log('Road data received:', data);
            
            if (data.elements && data.elements.length > 0) {
                // Pick the first way found
                const way = data.elements[0];
                const name = way.tags.name || way.tags.highway || 'Unnamed Road';
                const coordinates = way.geometry.map(point => [point.lat, point.lon]);
                
                // Check if this road is already marked
                let alreadyExists = false;
                markedRoads.eachLayer(layer => {
                    if (layer.osmId === way.id) alreadyExists = true;
                });

            if (alreadyExists) {
                loadingIndicator.style.display = 'none';
                alert("This road is already marked!");
            } else {
                addRoadToMap(coordinates, name, way.id);
                saveRoads();
                loadingIndicator.style.display = 'none';
            }
            fetched = true;
        } else {
            loadingIndicator.style.display = 'none';
            alert("No road found at this location. Try clicking closer to a road.");
            fetched = true; // Still counts as a successful API call, just no results
        }
    } catch (error) {
        console.warn(`${baseUrl} failed:`, error);
        clearTimeout(timeoutId);
    }
}

if (!fetched) {
    loadingIndicator.style.display = 'none';
    alert("Failed to fetch road data from all providers. This could be due to a network error or the providers being temporarily unavailable.");
}
}

function addRoadToMap(latlngs, name, osmId) {
    const layer = L.polyline(latlngs, {
        color: '#e74c3c',
        weight: 8,
        opacity: 0.8
    });
    
    layer.roadName = name;
    layer.osmId = osmId;
    
    markedRoads.addLayer(layer);
    addRoadToList(layer);
}

// Handle map clicks
map.on('click', function(e) {
    fetchRoadAt(e.latlng.lat, e.latlng.lng);
});

// Persistence logic
function saveRoads() {
    const data = [];
    markedRoads.eachLayer(layer => {
        data.push({
            latlngs: layer.getLatLngs(),
            name: layer.roadName,
            osmId: layer.osmId
        });
    });
    localStorage.setItem('roadClosers_v2_data', JSON.stringify(data));
}

function loadSavedRoads() {
    const saved = localStorage.getItem('roadClosers_v2_data');
    if (saved) {
        const data = JSON.parse(saved);
        data.forEach(item => {
            addRoadToMap(item.latlngs, item.name, item.osmId);
        });
    }
}

// UI: Add road to the sidebar list
function addRoadToList(layer) {
    const list = document.getElementById('road-list');
    const li = document.createElement('li');
    li.className = 'road-item';
    
    li.innerHTML = `
        <span>${layer.roadName}</span>
        <button onclick="removeRoad(${L.stamp(layer)})">Remove</button>
    `;
    
    li.addEventListener('mouseenter', () => {
        layer.setStyle({ color: '#f1c40f', weight: 10 });
    });
    
    li.addEventListener('mouseleave', () => {
        layer.setStyle({ color: '#e74c3c', weight: 8 });
    });

    li.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') {
            map.fitBounds(layer.getBounds());
        }
    });

    list.appendChild(li);
}

// UI: Remove road by Leaflet stamp ID
window.removeRoad = function(id) {
    markedRoads.eachLayer(layer => {
        if (L.stamp(layer) === id) {
            markedRoads.removeLayer(layer);
        }
    });
    refreshRoadList();
    saveRoads();
};

function refreshRoadList() {
    const list = document.getElementById('road-list');
    list.innerHTML = '';
    markedRoads.eachLayer(layer => {
        addRoadToList(layer);
    });
}

// UI: Clear all
document.getElementById('clear-all').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all marked roads?')) {
        markedRoads.clearLayers();
        refreshRoadList();
        saveRoads();
    }
});

// Initialize
loadSavedRoads();

