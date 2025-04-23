// preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('Chargement de preload.js...');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- Fonctions pour le Profil ---
  saveProfile: (profileData) => ipcRenderer.send('save-profile', profileData),
  loadProfileRequest: () => ipcRenderer.send('load-profile-request'), // Demande de chargement
  handleProfileLoaded: (callback) => { // Écoute les données chargées
      const listener = (_event, profileData) => callback(profileData);
      ipcRenderer.on('profile-loaded', listener);
      console.log('Preload: Listener pour profile-loaded attaché.');
      return () => {
          ipcRenderer.removeListener('profile-loaded', listener);
          console.log('Preload: Listener pour profile-loaded supprimé.');
      };
  },
  removeProfileListener: () => ipcRenderer.removeAllListeners('profile-loaded'),

  // --- Fonctions pour la génération CV/Lettre ---
  sendGenerationData: (data) => {
    console.log('Preload: Envoi de generate-request avec data:', { jobOffer: data.jobOffer?.substring(0, 30)+'...', /* Ne log plus profileText */ });
    ipcRenderer.send('generate-request', data); // Envoie {jobOffer} - main lira le profil
  },
  handleGenerationResult: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('generation-result', listener);
    console.log('Preload: Listener pour generation-result attaché.');
    return () => {
        ipcRenderer.removeListener('generation-result', listener);
        console.log('Preload: Listener pour generation-result supprimé.');
    };
  },
  removeResultListener: () => ipcRenderer.removeAllListeners('generation-result'),

  // --- Fonctions PDF supprimées/commentées ---
  // processCVContent: (arrayBuffer) => ipcRenderer.send('process-cv-content', arrayBuffer),
  // handleCVProcessed: (callback) => { /* ... */ },
  // removeCVListener: () => { /* ... */ }
});

console.log('Preload: Script exécuté, API electronAPI exposée sur window.');