// main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require('fs').promises;
const { Ollama } = require("ollama"); // Importe la CLASSE Ollama

// Crée une instance du client Ollama
const ollama = new Ollama({ host: 'http://localhost:11434' });
console.log("Main: Instance Ollama créée.");

let mainWindow; // Référence globale

// Fonction utilitaire pour obtenir le chemin du fichier profil
function getProfilePath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'profile.json');
}

function createWindow() {
  console.log("Main: Création de la fenêtre principale...");
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile("index.html");
  console.log("Main: index.html chargé.");

  mainWindow.webContents.openDevTools();
  console.log("Main: DevTools ouverts.");

  mainWindow.on('closed', () => {
      console.log("Main: Fenêtre principale fermée.");
      mainWindow = null;
  });
}

// --- Gestion des événements de l'application ---
app.whenReady().then(() => {
  console.log('Main: App Ready.');
  fs.mkdir(app.getPath('userData'), { recursive: true }) // Assure existence dossier userData
      .then(() => {
          console.log(`Main: Dossier userData vérifié/créé: ${app.getPath('userData')}`);
          createWindow();
      })
      .catch(err => {
           console.error("Main: CRITICAL - Erreur création dossier userData:", err);
           app.quit();
      });

  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") { app.quit(); }
});

// --- Gestion IPC ---

// 1. Sauvegarde du profil reçu du renderer
ipcMain.on('save-profile', async (event, profileData) => {
    const filePath = getProfilePath();
    console.log(`Main IPC: Reçu 'save-profile'. Sauvegarde dans: ${filePath}`);
    try {
        if (!profileData || typeof profileData !== 'object') {
            throw new Error("Données de profil invalides reçues.");
        }
        const jsonString = JSON.stringify(profileData, null, 2);
        await fs.writeFile(filePath, jsonString, 'utf-8');
        console.log("Main IPC: Profil sauvegardé avec succès.");
        // Optionnel: Confirmer au renderer
    } catch (error) {
        console.error("Main IPC Error [save-profile]:", error);
        // Optionnel: Envoyer erreur au renderer
    }
});

// 2. Chargement du profil pour le renderer
ipcMain.on('load-profile-request', async (event) => {
    const filePath = getProfilePath();
    console.log(`Main IPC: Reçu 'load-profile-request'. Lecture depuis: ${filePath}`);
    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const profileData = JSON.parse(fileContent);
        console.log("Main IPC: Profil chargé et parsé avec succès.");
        event.reply('profile-loaded', profileData);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log("Main IPC: Fichier profile.json non trouvé.");
            event.reply('profile-loaded', null);
        } else {
            console.error("Main IPC Error [load-profile-request]:", error);
            event.reply('profile-loaded', { error: error.message || "Erreur lecture profil" });
        }
    }
});


// 3. Génération CV/Lettre - Lit profil depuis fichier, utilise prompt final
ipcMain.on('generate-request', async (event, generationData) => {
    console.log("Main IPC: Reçu 'generate-request'...");
    if (!generationData || typeof generationData !== 'object' || !generationData.jobOffer) { return event.reply('generation-result', { cv: "Erreur interne: Offre manquante.", letter: "..."}); }
    const { jobOffer } = generationData;
    if (typeof jobOffer !== 'string' || jobOffer.trim() === '') { return event.reply('generation-result', { cv: "Erreur: Offre emploi manquante.", letter: "..."}); }

    let userProfileData;
    const profilePath = getProfilePath();

    // --- Lecture profil depuis fichier ---
    try {
         console.log(`Main IPC: Lecture du profil depuis ${profilePath} pour génération.`);
         const fileContent = await fs.readFile(profilePath, 'utf-8');
         userProfileData = JSON.parse(fileContent);
         console.log("Main IPC: Profil chargé pour génération.");
         if (!userProfileData || typeof userProfileData !== 'object') { throw new Error("Format profil invalide."); }
    } catch (error) {
         console.error("Main IPC Error [lecture profil pour génération]:", error);
         let errorMsg = "Erreur: Impossible lire profil sauvegardé.";
         if (error.code === 'ENOENT') errorMsg = "Erreur: Profil non sauvegardé.";
         return event.reply('generation-result', { cv: errorMsg, letter: errorMsg });
    }
    // --- Fin lecture ---

    console.log('Main IPC: Données prêtes pour génération.');

    // --- Formatage du profil pour le prompt ---
    let userProfileString = `Profil de ${userProfileData.name || 'Candidat'} (${userProfileData.email || 'Non spécifié'}):\n`;
    userProfileString += `Titre/Objectif: ${userProfileData.title || 'Non spécifié'}\n`;
    userProfileString += `Résumé: ${userProfileData.summary || 'Non spécifié'}\n`;
    userProfileString += `Compétences:\n${userProfileData.skills || 'Non spécifiées'}\n`;
    if (userProfileData.experiences && userProfileData.experiences.length > 0) {
        userProfileString += "\nExpériences:\n";
        userProfileData.experiences.forEach((exp) => {
            if (exp.title || exp.description) {
                 userProfileString += `- ${exp.title || '(Poste)'}:\n  ${exp.description || '(Détails non fournis)'}\n`;
            }
        });
    }
    // --- Fin Formatage ---
    console.log("Main IPC: Profil formaté pour le prompt (début):\n", userProfileString.substring(0, 200) + "...");


    // --- Construction du Prompt (Version finale affinée) ---
    const prompt = `
    OBJECTIF PRINCIPAL: Générer un CV adapté et une lettre de motivation personnalisée en français.

    SOURCE 1: PROFIL DU CANDIDAT (Unique source sur son parcours - Ne rien inventer d'autre)
    --- DEBUT PROFIL CANDIDAT ---
    ${userProfileString}
    --- FIN PROFIL CANDIDAT ---

    SOURCE 2: OFFRE D'EMPLOI CIBLE
    --- DEBUT OFFRE ---
    ${jobOffer}
    --- FIN OFFRE ---

    Tâche STRICTE : Génère un CV adapté et une lettre de motivation pour cette offre, en te basant **EXCLUSIVEMENT** sur le PROFIL CANDIDAT fourni. N'invente **AUCUNE** information, compétence, expérience ou durée qui ne soit pas **explicitement présente** dans le PROFIL CANDIDAT.

    Instructions Détaillées :
    1.  **Analyse Préliminaire (Interne, ne pas mettre dans la sortie):** Comprends le PROFIL CANDIDAT et l'OFFRE D'EMPLOI (poste, compétences clés, missions). Détermine si le profil correspond bien à l'offre (ex: Dev pour Dev) ou s'il y a une différence notable (ex: Dev pour Événementiel).
    2.  **Génération du CV Adapté:**
        * **Ne recopie PAS le profil brut.** Rédige **3 à 5 NOUVEAUX points** (format liste à puces).
        * Chaque point doit **prendre un élément CONCRET du PROFIL CANDIDAT** (une compétence listée, une tâche d'une expérience, une qualité du résumé) ET **l'EXPLIQUER en le reliant à une exigence ou une mission de l'OFFRE D'EMPLOI.**
        * **Exemples de formulation attendue :** "- Organisation et rigueur démontrées dans la gestion de projets de développement (voir profil), qualités transférables à la logistique événementielle." OU "- Créativité (mentionnée dans mon profil) appliquée à la conception d'interfaces, utile pour la mise en scène et la valorisation des produits lors d'événements." OU "- Autonomie et esprit d'équipe (voir profil) développés lors de stages/projets, essentiels pour la coordination sur site."
        * Commence le CV par le titre exact: "Candidature pour le poste de [Titre exact du poste de l'offre]".
        * **NE RIEN INVENTER.** Base-toi EXCLUSIVEMENT sur le profil fourni.
    3.  **Génération de la Lettre de Motivation (~150 mots):**
        * **Adresse : Utilise EXACTEMENT "Madame, Monsieur,".**
        * Introduction : Mentionne le titre exact du poste et l'entreprise. Indique clairement ton intérêt vif pour CE poste.
        * Développement : **Mets en avant 2-3 compétences spécifiques de ton profil qui correspondent PARFAITEMENT aux besoins de l'offre.** Donne si possible l'impression que tu as réfléchi à comment tu pourrais contribuer. **Évite absolument de dire que tu postules 'malgré' ton profil si l'offre correspond à tes compétences de base (ex: offre de développeur pour un profil de développeur).** Souligne plutôt la pertinence. **Si le profil est différent:** Reconnaît la différence, mets en avant compétences **transférables** du profil (organisation, autonomie, créativité, etc.) et explique comment elles s'appliquent à ce nouveau poste. Exprime une forte motivation pour le changement de domaine. **NE JAMAIS prétendre** avoir une expérience directe si absente du profil.
        * Motivation : Exprime ton enthousiasme pour les missions proposées ou l'environnement de travail décrit dans l'offre.
        * Conclusion : Propose un entretien et utilise une formule de politesse professionnelle standard (ex: "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.").
        * **Toujours :** Utilise **"vous" (vouvoiement)**. Ton professionnel, dynamique, sans faute.
    4.  **Format de Sortie OBLIGATOIRE:** Ta réponse finale doit être **UNIQUEMENT** un objet JSON valide. Il ne doit contenir **RIEN D'AUTRE** (pas d'explication, pas de texte avant/après). L'objet JSON doit avoir exactement ces deux clés:
        * cv: (string) contenant le texte COMPLET du CV adapté (Titre + points clés).
        * letter: (string) contenant le texte COMPLET de la lettre de motivation.

    Exemple de structure JSON attendue : {"cv": "Candidature pour...\\n\\n* Point 1...\\n* Point 2...", "letter": "Madame, Monsieur,\\n\\nJe vous écris..."}

    JSON Output:
    `; // Fin du prompt final

    console.log("Main IPC: Envoi du message 'Génération IA en cours...' à l'UI.");
    event.reply('generation-result', { cv: 'Génération IA en cours...', letter: 'Génération IA en cours...' });

    // --- Appel à Ollama ---
    try {
        // *** Modèle Llama 3 recommandé ici car il a mieux géré la différence de profil ***
        const modelToUse = 'llama3'; // <<< ESSAYE AVEC Llama 3
        console.log(`\n--- Main: >>> ÉTAPE 1: Envoi requête à Ollama (Modèle: ${modelToUse}) ---`);

        const response = await ollama.chat({
          model: modelToUse,
          messages: [{ role: 'user', content: prompt }],
          format: 'json',
          stream: false
        });

        console.log(`\n--- Main: <<< ÉTAPE 2: Réponse reçue d'Ollama ---`);
        console.log(`Main: Statut réponse: ${response?.status}, Durée: ${response?.total_duration/1e9}s`);

        let generatedResult;
        if (response.message && response.message.content && typeof response.message.content === 'string') {
            console.log("Main: >>> ÉTAPE 3: Traitement de response.message.content...");
            let responseContent = response.message.content.trim();
            if (responseContent.startsWith('```json')) { responseContent = responseContent.substring(7).trim(); }
            if (responseContent.endsWith('```')) { responseContent = responseContent.substring(0, responseContent.length - 3).trim(); }
            console.log("Main: Contenu (nettoyé?) prêt pour parsing:", responseContent.substring(0,100) + "...");

            try {
                generatedResult = JSON.parse(responseContent);
                console.log("Main: <<< ÉTAPE 4: JSON parsé avec succès.");
                if (typeof generatedResult !== 'object' || generatedResult === null || typeof generatedResult.cv !== 'string' || typeof generatedResult.letter !== 'string') {
                   console.warn("Main Warning: Structure JSON non conforme:", generatedResult);
                  throw new Error("JSON Ollama n'a pas la structure attendue {cv: string, letter: string}");
                }
                 console.log("Main: Structure JSON conforme trouvée !");
            } catch (parseError) {
                console.error("Main Error: ÉCHEC DU PARSING JSON:", parseError);
                console.error("Contenu brut ayant échoué:", response.message.content);
                generatedResult = {
                  cv: `Erreur Parsing: ${parseError.message}\nContenu Reçu (Début):\n${response.message.content.substring(0, 200)}...`,
                  letter: `Erreur Parsing: ${parseError.message}\nContenu Reçu (Début):\n${response.message.content.substring(0, 200)}...`
                };
                 console.log("Main: Erreur de parsing formatée pour l'UI.");
            }
        } else {
           console.error("Main Error: Réponse Ollama invalide ou contenu message manquant:", response);
          throw new Error(`Réponse Ollama invalide/contenu manquant. Statut: ${response?.status}`);
        }

        console.log("Main: >>> ÉTAPE 5: Envoi du résultat final ... au renderer...");
        event.reply('generation-result', generatedResult);
        console.log("Main: <<< ÉTAPE 6: Résultat envoyé au renderer.");

    } catch (error) {
        console.error("\n--- Main Error [Catch Global Appel Ollama]: ERREUR ATTRAPÉE ! ---");
        console.error("Erreur Name:", error.name);
        console.error("Erreur Message:", error.message);
        event.reply('generation-result', {
          cv: `Erreur Ollama:\n${error.message}`,
          letter: `Erreur Ollama:\n${error.message}\nVérifiez console & Ollama.`
        });
         console.log("Main IPC: Message d'erreur (Catch Global) envoyé au renderer.");
    }
}); // Fin de ipcMain.on('generate-request')

console.log("Main: Fin script. Attente événements app/IPC...");