// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {getStorage} from 'firebase/storage'
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// Replace with your own Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyB1MBNiU5SaWrfLnCbszjjWUPr0IOLEbeE",
  authDomain: "testinfirebase-b90f7.firebaseapp.com",
  projectId: "testinfirebase-b90f7",
  storageBucket: "testinfirebase-b90f7.firebasestorage.app",
  messagingSenderId: "247938991180",
  appId: "1:247938991180:web:8e7cfe21e4a1563f85a0e9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const dbFirestore = getFirestore(app);
const storageFirebase = getStorage(app);
const authFirebase = getAuth(app);

export {dbFirestore, storageFirebase, authFirebase};