importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/cloud-messaging/js/receive
firebase.initializeApp({
  apiKey: "AIzaSyBnrwjybHXny3RSmPi-eqhfeLvva6TNzTo",
  authDomain: "ai-studio-applet-webapp-3b275.firebaseapp.com",
  projectId: "ai-studio-applet-webapp-3b275",
  storageBucket: "ai-studio-applet-webapp-3b275.firebasestorage.app",
  messagingSenderId: "827711046519",
  appId: "1:827711046519:web:208a19719afd690dd51772"
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png'
  };

  self.notification.showNotification(notificationTitle,
    notificationOptions);
});
