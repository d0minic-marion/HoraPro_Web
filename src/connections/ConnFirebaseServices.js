// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {getStorage} from 'firebase/storage'
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// Replace with your own Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyBmCt2OfRzRwsinlaJ520k9C-vUgkwGUhw",
  authDomain: "projet-horapro.firebaseapp.com",
  databaseURL: "https://projet-horapro-default-rtdb.firebaseio.com",
  projectId: "projet-horapro",
  storageBucket: "projet-horapro.firebasestorage.app",
  messagingSenderId: "596712791755",
  appId: "1:596712791755:web:752253c3831ea7debc854e",
  measurementId: "G-9NHHM3RE8E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const dbFirestore = getFirestore(app);
const storageFirebase = getStorage(app);
const authFirebase = getAuth(app);

// Set authentication persistence to local (survives page refreshes and browser restarts)
setPersistence(authFirebase, browserLocalPersistence)
  .catch((error) => {
    console.error("Error setting auth persistence:", error);
  });

export {dbFirestore, storageFirebase, authFirebase};