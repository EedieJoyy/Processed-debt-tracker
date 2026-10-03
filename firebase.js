// firebase.js

const firebaseConfig = {
  apiKey: "AIzaSyB6Q_5yk9ZQa6XzYlGp1RfsveGB5iR7tSs",
  authDomain: "employee-debt-tracker.firebaseapp.com",
  projectId: "employee-debt-tracker",
  storageBucket: "employee-debt-tracker.firebasestorage.app",
  messagingSenderId: "713999994148",
  appId: "1:713999994148:web:55ebbe0b3f6b9814baf7b1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export Firestore
const db = firebase.firestore();