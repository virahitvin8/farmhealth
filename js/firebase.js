/* ═══════════════════════════════════════════════════════════
   FarmHealth — Firebase Module
   ═══════════════════════════════════════════════════════════
   Initializes Firebase, provides Google Sign-In auth, and
   Firestore database operations for saved fields, settings,
   and land records persistence.
   ═══════════════════════════════════════════════════════════ */

// ─── Firebase Configuration (from your Firebase Console) ───
const firebaseConfig = {
  apiKey: "AIzaSyDkRusVDAA_-qETpscCFSHeq0VDuf4pr0o",
  authDomain: "operationorigami-a33e0.firebaseapp.com",
  projectId: "operationorigami-a33e0",
  storageBucket: "operationorigami-a33e0.firebasestorage.app",
  messagingSenderId: "542283548151",
  appId: "1:542283548151:web:f8f2944cfadcc0303cdaf2",
  measurementId: "G-N2Q8NWTVYF"
};

const FH_FIREBASE = (function() {
  'use strict';

  // The admin email — akshitvinay4636@gmail.com gets full admin privileges
  const ADMIN_EMAIL = 'akshitvinay4636@gmail.com';

  let _app = null;
  let _auth = null;
  let _db = null;
  let _currentUser = null;
  let _initialized = false;

  // ─── Initialize Firebase ───
  function init() {
    if (_initialized) return;
    try {
      // Initialize Firebase app
      _app = firebase.initializeApp(firebaseConfig);
      _auth = firebase.auth(_app);
      _db = firebase.firestore(_app);

      // Enable offline persistence (works even without internet)
      _db.settings({ 
        cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED 
      });
      _db.enablePersistence().catch(err => {
        console.warn('Firestore persistence:', err.message);
      });

      // Listen for auth state changes
      _auth.onAuthStateChanged(user => {
        _currentUser = user;
        if (user) {
          // User is signed in — trigger UI update
          const role = user.email === ADMIN_EMAIL ? 'admin' : 'user';
          localStorage.setItem('fh_auth_role', role);
          localStorage.setItem('fh_auth_email', user.email);
          localStorage.setItem('fh_auth_name', user.displayName || user.email);
          localStorage.setItem('fh_auth_photo', user.photoURL || '');
          
          // Close login modal and update UI
          const modal = document.getElementById('loginModal');
          if (modal) modal.classList.remove('show');
          
          if (window.FH_UI && FH_UI.applyRoleUI) {
            FH_UI.applyRoleUI(role);
          }
          
          // Update user info in sidebar
          const userInfo = document.getElementById('userInfo');
          if (userInfo) {
            const photo = user.photoURL || '';
            const name = user.displayName || user.email;
            userInfo.innerHTML = photo 
              ? `<img src="${photo}" class="user-avatar" alt=""> <span class="user-name">${name}</span>`
              : `<span class="user-avatar-placeholder">${name.charAt(0).toUpperCase()}</span> <span class="user-name">${name}</span>`;
          }
          
          const toast = window.FH_UTILS && FH_UTILS.toast;
          if (toast) toast(`👋 Welcome, ${user.displayName || user.email}!`);
        } else {
          // User is signed out — show login modal
          localStorage.removeItem('fh_auth_role');
          localStorage.removeItem('fh_auth_email');
          const modal = document.getElementById('loginModal');
          if (modal && !localStorage.getItem('fh_auth_manual_logout')) {
            modal.classList.add('show');
          }
          localStorage.removeItem('fh_auth_manual_logout');
        }
      });

      _initialized = true;
      console.log('[Firebase] Initialized successfully');
    } catch (e) {
      console.error('[Firebase] Init failed:', e);
    }
  }

  // ─── Google Sign-In ───
  async function signInWithGoogle() {
    try {
      if (!_auth) return { success: false, error: 'Firebase not initialized' };
      
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await _auth.signInWithPopup(provider);
      const user = result.user;
      
      // Save user to Firestore on first login
      if (user && _db) {
        const userRef = _db.collection('users').doc(user.uid);
        const doc = await userRef.get();
        if (!doc.exists) {
          await userRef.set({
            email: user.email,
            name: user.displayName || '',
            photoURL: user.photoURL || '',
            role: user.email === ADMIN_EMAIL ? 'admin' : 'user',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      
      return { success: true, user };
    } catch (e) {
      console.error('[Firebase] Sign-in error:', e);
      return { success: false, error: e.message };
    }
  }

  // ─── Sign Out ───
  async function signOut() {
    try {
      if (!_auth) return;
      localStorage.setItem('fh_auth_manual_logout', 'true');
      await _auth.signOut();
      window.location.reload();
    } catch (e) {
      console.error('[Firebase] Sign-out error:', e);
    }
  }

  // ─── Get Current User ───
  function getCurrentUser() {
    return _currentUser;
  }

  // ─── Check if Current User is Admin ───
  function isAdmin() {
    return _currentUser && _currentUser.email === ADMIN_EMAIL;
  }

  // ─── Get Current User Email ───
  function getUserEmail() {
    return _currentUser ? _currentUser.email : null;
  }

  // ─── FIRESTORE: Save Field ───
  async function saveField(fieldData) {
    try {
      if (!_currentUser || !_db) return { success: false, error: 'Not logged in' };
      const ref = _db.collection('users').doc(_currentUser.uid)
        .collection('savedFields').doc(fieldData.id);
      await ref.set({
        ...fieldData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { success: true };
    } catch (e) {
      console.error('[Firebase] saveField error:', e);
      return { success: false, error: e.message };
    }
  }

  // ─── FIRESTORE: Load All Saved Fields ───
  async function loadSavedFields() {
    try {
      if (!_currentUser || !_db) return [];
      const snapshot = await _db.collection('users').doc(_currentUser.uid)
        .collection('savedFields')
        .orderBy('updatedAt', 'desc')
        .get();
      return snapshot.docs.map(doc => doc.data());
    } catch (e) {
      console.error('[Firebase] loadSavedFields error:', e);
      return [];
    }
  }

  // ─── FIRESTORE: Delete Saved Field ───
  async function deleteSavedField(fieldId) {
    try {
      if (!_currentUser || !_db) return;
      await _db.collection('users').doc(_currentUser.uid)
        .collection('savedFields').doc(fieldId).delete();
    } catch (e) {
      console.error('[Firebase] deleteSavedField error:', e);
    }
  }

  // ─── FIRESTORE: Save Settings ───
  async function saveSettings(settings) {
    try {
      if (!_currentUser || !_db) return;
      await _db.collection('users').doc(_currentUser.uid)
        .collection('settings').doc('preferences')
        .set({
          ...settings,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
      console.error('[Firebase] saveSettings error:', e);
    }
  }

  // ─── FIRESTORE: Load Settings ───
  async function loadSettings() {
    try {
      if (!_currentUser || !_db) return null;
      const doc = await _db.collection('users').doc(_currentUser.uid)
        .collection('settings').doc('preferences').get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      console.error('[Firebase] loadSettings error:', e);
      return null;
    }
  }

  return {
    init,
    signInWithGoogle,
    signOut,
    getCurrentUser,
    isAdmin,
    getUserEmail,
    saveField,
    loadSavedFields,
    deleteSavedField,
    saveSettings,
    loadSettings,
    ADMIN_EMAIL
  };
})();
