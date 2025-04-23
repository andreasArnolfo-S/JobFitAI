// renderer.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Log de démarrage ---
    console.log('DOM chargé. Init renderer.js (v. Profil Manuel)...');

    // --- Récupération Éléments ---
    const jobOfferTextarea = document.getElementById('job-offer');
    const generateButton = document.getElementById('generate-btn');
    const cvOutputDiv = document.getElementById('cv-output');
    const letterOutputDiv = document.getElementById('letter-output');
    // Éléments du Formulaire Profil
    const profileNameInput = document.getElementById('profile-name');
    const profileEmailInput = document.getElementById('profile-email');
    const profileTitleInput = document.getElementById('profile-title');
    const profileSummaryTextarea = document.getElementById('profile-summary');
    const profileSkillsTextarea = document.getElementById('profile-skills');
    const exp1TitleInput = document.getElementById('exp1-title');
    const exp1DescTextarea = document.getElementById('exp1-desc');
    const saveProfileButton = document.getElementById('save-profile-btn');
    const saveStatusP = document.getElementById('save-status');
    // const debugProfileLoadedPre = document.getElementById('debug-profile-loaded'); // Pour la zone debug si décommentée

    // --- Vérification des éléments essentiels ---
    if (!profileNameInput) console.error('ERREUR CRITIQUE : Élément #profile-name non trouvé !');
    // ... (ajouter des vérifications similaires pour les autres éléments si nécessaire) ...
    if (!generateButton) console.error('ERREUR CRITIQUE : Élément #generate-btn non trouvé !');
    if (!cvOutputDiv) console.error('ERREUR CRITIQUE : Élément #cv-output non trouvé !');
    if (!letterOutputDiv) console.error('ERREUR CRITIQUE : Élément #letter-output non trouvé !');


    // --- Variables ---
    let currentProfileData = null; // Stockera le profil chargé
    let unsubscribeHandleGenerationResult = null;
    let unsubscribeHandleProfileLoaded = null;

    // --- Fonction pour remplir le formulaire depuis les données ---
    function populateProfileForm(profileData) {
        if (!profileData) return;
        console.log("Renderer: Remplissage du formulaire avec les données chargées.");
        if (profileNameInput) profileNameInput.value = profileData.name || '';
        if (profileEmailInput) profileEmailInput.value = profileData.email || '';
        if (profileTitleInput) profileTitleInput.value = profileData.title || '';
        if (profileSummaryTextarea) profileSummaryTextarea.value = profileData.summary || '';
        if (profileSkillsTextarea) profileSkillsTextarea.value = profileData.skills || '';
        // Exemple pour la première expérience (à étendre si plusieurs)
        if (profileData.experiences && profileData.experiences.length > 0) {
            if (exp1TitleInput) exp1TitleInput.value = profileData.experiences[0].title || '';
            if (exp1DescTextarea) exp1DescTextarea.value = profileData.experiences[0].description || '';
        }
         // if(debugProfileLoadedPre) debugProfileLoadedPre.textContent = JSON.stringify(profileData, null, 2);
    }

    // --- Demande de chargement du profil au démarrage ---
    if (window.electronAPI && typeof window.electronAPI.loadProfileRequest === 'function') {
        console.log("Renderer: Demande de chargement du profil au processus principal...");
        window.electronAPI.loadProfileRequest();
    } else {
        console.error("Renderer Error: Impossible de demander le chargement du profil (API absente).");
    }

    // --- Écoute les données du profil chargées ---
    try {
        if (window.electronAPI && typeof window.electronAPI.handleProfileLoaded === 'function') {
            unsubscribeHandleProfileLoaded = window.electronAPI.handleProfileLoaded((profileData) => {
                console.log('Renderer: Données de profil reçues:', profileData);
                if (profileData && typeof profileData === 'object' && !profileData.error) { // Ajout check !profileData.error
                    currentProfileData = profileData; // Stocke les données chargées
                    populateProfileForm(currentProfileData); // Remplit le formulaire
                    console.log('Renderer: Formulaire de profil mis à jour.');
                    if(saveStatusP) saveStatusP.textContent = 'Profil chargé.';
                    setTimeout(() => { if(saveStatusP) saveStatusP.textContent = ''; }, 3000);
                } else {
                    let errorMsg = 'Aucun profil sauvegardé trouvé ou données invalides.';
                    if(profileData && profileData.error) {
                        errorMsg = `Erreur chargement profil: ${profileData.error}`;
                    }
                    console.log(`Renderer: ${errorMsg}`);
                    currentProfileData = null;
                     // if(debugProfileLoadedPre) debugProfileLoadedPre.textContent = errorMsg;
                     // Ne pas afficher d'alerte ici, l'absence de profil est normale au premier lancement
                }
            });
            console.log('Renderer: Listener handleProfileLoaded attaché.');
        } else {
            console.error('Renderer Error: handleProfileLoaded non disponible.');
            if(saveStatusP) saveStatusP.textContent = 'Erreur init.'; // Affiche erreur si API manque
        }
    } catch (error) {
         console.error("Renderer Error: Erreur attachement listener handleProfileLoaded:", error);
    }

    // --- Logique de Sauvegarde du Profil ---
    if (saveProfileButton) {
        saveProfileButton.addEventListener('click', () => {
            console.log('Renderer: Clic sur Sauvegarder Profil');
            if(saveStatusP) {
                saveStatusP.textContent = 'Sauvegarde...';
                saveStatusP.className = 'text-sm text-blue-600 mt-1 inline-block ml-4';
            }

            const profileDataToSave = {
                name: profileNameInput?.value || '',
                email: profileEmailInput?.value || '',
                title: profileTitleInput?.value || '',
                summary: profileSummaryTextarea?.value || '',
                skills: profileSkillsTextarea?.value || '',
                experiences: [
                    {
                        title: exp1TitleInput?.value || '',
                        description: exp1DescTextarea?.value || ''
                    }
                ],
            };
            console.log('Renderer: Données profil à sauvegarder:', profileDataToSave);

            if (window.electronAPI && typeof window.electronAPI.saveProfile === 'function') {
                window.electronAPI.saveProfile(profileDataToSave);
                currentProfileData = profileDataToSave;
                if(saveStatusP) {
                    saveStatusP.textContent = 'Profil Sauvegardé !';
                    saveStatusP.className = 'text-sm text-green-600 mt-1 inline-block ml-4';
                    setTimeout(() => { if(saveStatusP) saveStatusP.textContent = ''; }, 3000);
                }
            } else {
                console.error("Renderer Error: saveProfile non disponible.");
                 if(saveStatusP) { /* ... gestion erreur API ... */ }
            }
        });
        console.log('Renderer: Listener "click" attaché à #save-profile-btn.');
    }

    // --- Logique de Génération ---
    if (generateButton) {
        generateButton.addEventListener('click', () => {
            console.log('Renderer: Clic sur Générer.');
            const offerText = jobOfferTextarea ? jobOfferTextarea.value : '';

            if (!currentProfileData) {
                 alert('ERREUR : Profil non chargé ou non sauvegardé. Veuillez remplir et sauvegarder votre profil d\'abord.');
                 console.error("Tentative de génération sans données de profil disponibles.");
                 return;
            }
             if (!offerText || offerText.trim() === '') {
                 alert('Veuillez coller une offre d\'emploi.');
                 return;
             }

            if(cvOutputDiv) cvOutputDiv.innerHTML = '<p class="text-gray-500 p-2">Génération IA en cours...</p>'; // Ajout padding
            if(letterOutputDiv) letterOutputDiv.innerHTML = '<p class="text-gray-500 p-2">Génération IA en cours...</p>'; // Ajout padding
            console.log('Renderer: Envoi de l\'offre pour génération...');

            if (window.electronAPI && typeof window.electronAPI.sendGenerationData === 'function') {
                 window.electronAPI.sendGenerationData({ jobOffer: offerText });
            } else { console.error("Renderer Error: sendGenerationData non disponible."); }
        });
         console.log('Renderer: Listener "click" attaché à #generate-btn.');
    }

    // --- Écoute les résultats de la génération (AVEC LOGS DEBUG UI UPDATE) ---
    try {
        if (window.electronAPI && typeof window.electronAPI.handleGenerationResult === 'function') {
           unsubscribeHandleGenerationResult = window.electronAPI.handleGenerationResult((result) => {
                // --- CONTENU DE LA FONCTION CALLBACK AVEC DEBUG LOGS ---
                console.log('Renderer: Résultat de génération reçu:', result); // Log existant

                const cvPre = cvOutputDiv?.querySelector('pre');
                const letterPre = letterOutputDiv?.querySelector('pre');

                // --- NOUVEAUX LOGS DE DEBUG ---
                console.log('Renderer DEBUG: cvPre trouvé?', cvPre); // Vérifie si l'élément <pre> du CV est trouvé
                console.log('Renderer DEBUG: letterPre trouvé?', letterPre); // Vérifie si l'élément <pre> de la lettre est trouvé
                // --- FIN NOUVEAUX LOGS DE DEBUG ---

                if(cvPre) {
                    // --- NOUVEAU LOG DE DEBUG ---
                    console.log('Renderer DEBUG: Tentative de mise à jour de cvPre.textContent avec (début):', result.cv?.substring(0,50) + '...');
                    cvPre.textContent = result.cv || '[CV non généré ou vide]'; // Mise à jour du texte
                    console.log('Renderer DEBUG: cvPre.textContent mis à jour (Vérifie l\'UI!).'); // Confirmation après mise à jour
                } else {
                    console.error("Renderer Error: Élément <pre> non trouvé dans #cv-output ! Tentative sur div parent.");
                    if (cvOutputDiv) cvOutputDiv.textContent = result.cv || '[CV non généré ou vide]'; // Fallback
                }

                if(letterPre) {
                    // --- NOUVEAU LOG DE DEBUG ---
                    console.log('Renderer DEBUG: Tentative de mise à jour de letterPre.textContent avec (début):', result.letter?.substring(0,50) + '...');
                    letterPre.textContent = result.letter || '[Lettre non générée ou vide]'; // Mise à jour du texte
                    console.log('Renderer DEBUG: letterPre.textContent mis à jour (Vérifie l\'UI!).'); // Confirmation après mise à jour
                } else {
                    console.error("Renderer Error: Élément <pre> non trouvé dans #letter-output ! Tentative sur div parent.");
                    if (letterOutputDiv) letterOutputDiv.textContent = result.letter || '[Lettre non générée ou vide]'; // Fallback
                }
                // --- FIN CONTENU DE LA FONCTION CALLBACK ---
           });
            console.log('Renderer: Listener handleGenerationResult attaché.');
        } else { console.error('Renderer Error: handleGenerationResult non disponible.'); }
    } catch(error) { console.error("Renderer Error: Erreur attachement listener handleGenerationResult:", error); }

    // --- Nettoyage des listeners ---
    window.addEventListener('beforeunload', () => {
        console.log("Renderer: Nettoyage listeners IPC.");
        if (typeof unsubscribeHandleProfileLoaded === 'function') { unsubscribeHandleProfileLoaded(); console.log("Renderer: Listener handleProfileLoaded désinscrit.")}
        if (typeof unsubscribeHandleGenerationResult === 'function') { unsubscribeHandleGenerationResult(); console.log("Renderer: Listener handleGenerationResult désinscrit.")}
    });

    console.log("Renderer: Initialisation terminée (v. Profil Manuel + Load).");
}); // Fin de DOMContentLoaded