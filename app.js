// Global variables
let isAuthorized = false;
let spreadsheetId;
let sheetName = 'Expenses';
let userEmail;

// DOM Elements
const authSection = document.getElementById('auth-section');
const appContent = document.getElementById('app-content');
const loginStatus = document.getElementById('login-status');
const entryForm = document.getElementById('entry-form');
const entriesList = document.getElementById('entries-list');
const tabButtons = document.querySelectorAll('.tab-btn');
const authorizeButton = document.getElementById('authorize-button');
const signoutButton = document.getElementById('signout-button');

// Google API Client ID - You'll need to replace this with your actual client ID
// Get one from https://console.cloud.google.com/apis/credentials
const CLIENT_ID = ''; // Leave empty for now - will be set up later
const API_KEY = ''; // Leave empty for now - will be set up later

// Google API scopes needed
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive';

/**
 * Initialize the API client and make API discovery calls
 */
function initClient() {
    if (!CLIENT_ID || !API_KEY) {
        loginStatus.textContent = 'This app requires Google API credentials to be configured.';
        return;
    }
    
    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        scope: SCOPES,
        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4', 
                        'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
    }).then(() => {
        // Listen for sign-in state changes
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
        
        // Handle the initial sign-in state
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
        
        // Attach click handlers for the auth buttons
        authorizeButton.onclick = handleAuthClick;
        signoutButton.onclick = handleSignoutClick;
    }).catch(error => {
        console.error('Error initializing Google API client:', error);
        loginStatus.textContent = 'Error initializing Google API. Check console for details.';
    });
}

/**
 * Handle login button click
 */
function handleAuthClick() {
    gapi.auth2.getAuthInstance().signIn();
}

/**
 * Handle logout button click
 */
function handleSignoutClick() {
    gapi.auth2.getAuthInstance().signOut();
}

// Update UI based on sign-in status
function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
        // User is signed in, show app content
        isAuthorized = true;
        authorizeButton.classList.add('hidden');
        signoutButton.classList.remove('hidden');
        authSection.classList.add('hidden');
        appContent.classList.remove('hidden');
        
        // Get user info
        const user = gapi.auth2.getAuthInstance().currentUser.get();
        const profile = user.getBasicProfile();
        userEmail = profile.getEmail();
        loginStatus.textContent = `Signed in as ${profile.getName()}`;
        
        // Find or create spreadsheet
        findOrCreateSpreadsheet();
    } else {
        // User is not signed in, show auth section
        isAuthorized = false;
        authorizeButton.classList.remove('hidden');
        signoutButton.classList.add('hidden');
        authSection.classList.remove('hidden');
        appContent.classList.add('hidden');
        loginStatus.textContent = 'Please sign in to access your tracker';
    }
}

// Find existing spreadsheet or create a new one
function findOrCreateSpreadsheet() {
    gapi.client.drive.files.list({
        q: "name='ExpenseTracker' and mimeType='application/vnd.google-apps.spreadsheet'",
        spaces: 'drive',
        fields: 'files(id, name)'
    }).then(response => {
        const files = response.result.files;
        
        if (files && files.length > 0) {
            // Existing spreadsheet found
            spreadsheetId = files[0].id;
            loadEntries();
        } else {
            // No spreadsheet found, create a new one
            createSpreadsheet();
        }
    }).catch(error => {
        console.error('Error searching for spreadsheet:', error);
        loginStatus.textContent = 'Error accessing Google Drive. Please try again.';
    });
}

// Create a new spreadsheet
function createSpreadsheet() {
    gapi.client.sheets.spreadsheets.create({
        properties: {
            title: 'ExpenseTracker'
        },
        sheets: [
            {
                properties: {
                    title: sheetName,
                    gridProperties: {
                        rowCount: 1000,
                        columnCount: 3
                    }
                }
            }
        ]
    }).then(response => {
        spreadsheetId = response.result.spreadsheetId;
        
        // Set up header row
        gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A1:C1`,
            valueInputOption: 'RAW',
            resource: {
                values: [['Name', 'Amount', 'Type']]
            }
        }).then(() => {
            loadEntries();
        });
    }).catch(error => {
        console.error('Error creating spreadsheet:', error);
        loginStatus.textContent = 'Error creating spreadsheet. Please try again.';
    });
}

// Load entries from the spreadsheet
function loadEntries(filter = 'all') {
    if (!spreadsheetId) return;
    
    entriesList.innerHTML = '<p class="loading">Loading entries...</p>';
    
    gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A2:C`
    }).then(response => {
        const values = response.result.values || [];
        
        if (values.length === 0) {
            entriesList.innerHTML = '<p>No entries found. Add your first entry above.</p>';
            return;
        }
        
        // Filter entries if needed
        const filteredValues = filter === 'all' 
            ? values 
            : values.filter(row => row[2] === filter);
        
        if (filteredValues.length === 0) {
            entriesList.innerHTML = `<p>No ${filter} entries found.</p>`;
            return;
        }
        
        // Display entries
        let html = '';
        filteredValues.forEach(row => {
            const name = row[0] || 'Unknown';
            const amount = parseFloat(row[1]) || 0;
            const type = row[2] || 'expense';
            
            html += `
                <div class="entry-item">
                    <span class="entry-name">${name}</span>
                    <span class="entry-amount ${type}">${type === 'expense' ? '-' : '+'} ₹${amount.toFixed(2)}</span>
                </div>
            `;
        });
        
        entriesList.innerHTML = html;
    }).catch(error => {
        console.error('Error loading entries:', error);
        entriesList.innerHTML = '<p>Error loading entries. Please try again.</p>';
    });
}

// Add a new entry to the spreadsheet
function addEntry(name, amount, type) {
    if (!spreadsheetId) return;
    
    gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A2:C2`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
            values: [[name, amount, type]]
        }
    }).then(() => {
        // Reload entries after adding a new one
        loadEntries(document.querySelector('.tab-btn.active').dataset.tab);
    }).catch(error => {
        console.error('Error adding entry:', error);
        alert('Error adding entry. Please try again.');
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Form submission
    entryForm.addEventListener('submit', e => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const amount = document.getElementById('amount').value;
        const type = document.getElementById('type').value;
        
        addEntry(name, amount, type);
        
        // Reset form
        entryForm.reset();
    });
    
    // Tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active tab
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Load filtered entries
            loadEntries(button.dataset.tab);
        });
    });
});

/**
 * On load, called to load the auth2 library and API client library.
 */
function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

// Initialize the application when the Google API client is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Form submission
    entryForm.addEventListener('submit', e => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const amount = document.getElementById('amount').value;
        const type = document.getElementById('type').value;
        
        addEntry(name, amount, type);
        
        // Reset form
        entryForm.reset();
    });
    
    // Tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active tab
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Load filtered entries
            loadEntries(button.dataset.tab);
        });
    });
});

// Load the auth2 library when the page loads
window.onload = function() {
    console.log('Page loaded, initializing Google API client');
    handleClientLoad();
};
