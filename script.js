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
    loadingIndicator.style.display = 'block';
    
    // Search radius in meters
    const radius = 20; 
    
    // Overpass QL query to find the nearest highway
    const query = `
        [out:json][timeout:25];
        way(around:${radius},${lat},${lng})["highway"];
        out geom;
    `;
    
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    try {
        const response = await fetch(url);
        const data = await response.json();
        
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
                alert("This road is already marked!");
            } else {
                addRoadToMap(coordinates, name, way.id);
                saveRoads();
            }
        } else {
            alert("No road found at this location. Try clicking closer to a road.");
        }
    } catch (error) {
        console.error('Error fetching road data:', error);
        alert("Failed to fetch road data. Please try again.");
    } finally {
        loadingIndicator.style.display = 'none';
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

