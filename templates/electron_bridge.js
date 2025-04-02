// Electron bridge script that will be loaded in all HTML pages
(function() {
  // Check if we're running in Electron
  window.isElectron = typeof window.electron !== 'undefined';
  
  // Add a class to body for electron-specific styles
  if (window.isElectron) {
    document.body.classList.add('electron-app');
    
    // Add Electron-specific styles
    const style = document.createElement('style');
    style.textContent = `
      /* Scale fixes for Electron */
      html, body {
        zoom: 0.9; /* Fallback for older browsers */
        -webkit-text-size-adjust: 90%;
      }
      
      /* Electron-specific styles */
      .electron-app {
        /* Add any additional styles for Electron here */
      }
      
      /* Fix for specific container widths */
      .electron-app .container {
        max-width: 100%;
      }
    `;
    document.head.appendChild(style);
  }

  // Function to restart the Flask server
  window.restartServer = async function() {
    if (!window.isElectron) return Promise.resolve({ success: false, error: 'Not in Electron environment' });
    
    try {
      const result = await window.electron.invoke('restart-server');
      return result;
    } catch (error) {
      console.error('Error restarting server:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  };

  // Function to log to main process
  window.logToMain = function(level, message, data) {
    if (!window.isElectron) return;
    
    window.electron.send('log', {
      level,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  };

  // Function to show a native dialog
  window.showDialog = async function(options) {
    if (!window.isElectron) return Promise.resolve({ cancelled: true });
    
    try {
      return await window.electron.invoke('show-dialog', options);
    } catch (error) {
      console.error('Error showing dialog:', error);
      return { cancelled: true, error: error.message };
    }
  };

  // Function to open external links
  window.openExternal = function(url) {
    if (!window.isElectron) {
      window.open(url, '_blank');
      return;
    }
    
    window.electron.send('open-external', { url });
  };

  // Function for navigation
  window.navigateInApp = function(direction) {
    if (!window.isElectron) return;
    
    window.electron.send('navigate', { direction });
  };

  // Listen for server status updates from the main process
  if (window.isElectron) {
    window.electron.receive('server-status', function(status) {
      console.log('Server status update:', status);
      // You can update UI elements here based on server status
    });
  }

  // Log that the bridge is loaded
  console.log('Electron bridge initialized, running in Electron:', window.isElectron);
})(); 