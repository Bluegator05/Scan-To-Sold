import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDbNfSToFHD5jjbWLCQTkBy9ncFPrDKVnM",
    authDomain: "scantosold.firebaseapp.com",
    projectId: "scantosold",
    storageBucket: "scantosold.firebasestorage.app",
    messagingSenderId: "1073943520986",
    appId: "1:1073943520986:web:d63d0787e114a6736c27e3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics
const analytics = getAnalytics(app);

export { app, analytics, logEvent };
