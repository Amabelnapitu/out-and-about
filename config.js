// Where Out & About gets its data. Each link is a tab of the Review sheet published as CSV
// (File → Share → Publish to web → pick the tab → Comma-separated values).
// Leave a link empty to use the saved copy in the data folder instead.
window.OUT_AND_ABOUT_CONFIG = {
  cafesCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQM22to-Oh9Zy1PjmVIxg7vClM4w9w1bWhlO4x2Tnw7AjTX0VoX4FE4bkBzZKERBnHtgDHwGMYkps5e/pub?gid=1901912852&single=true&output=csv", // APP tab
  foodCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQM22to-Oh9Zy1PjmVIxg7vClM4w9w1bWhlO4x2Tnw7AjTX0VoX4FE4bkBzZKERBnHtgDHwGMYkps5e/pub?gid=382672132&single=true&output=csv", // FOOD tab
  barsCsvUrl: "",    // BAR tab: paste its published CSV link here once it's set up
  dessertCsvUrl: "", // DESSERT tab: paste its published CSV link here (until then the saved copy in data/desserts.csv is used)
  branchesCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQM22to-Oh9Zy1PjmVIxg7vClM4w9w1bWhlO4x2Tnw7AjTX0VoX4FE4bkBzZKERBnHtgDHwGMYkps5e/pub?gid=1996833004&single=true&output=csv", // BRANCHES tab (filled in by the monthly check)
  // The same Apps Script web app as Bean There: votes, notes and "has this closed?" reports.
  apiUrl: "https://script.google.com/macros/s/AKfycbyYj61cIkk6NVqXG_2-xLskuCujgzIE-ijwffMfdOBDeJYzN25AVo9pYVFIh_HOpt68/exec",
  // Sign-in and sync (optional). Set firebase to null to switch it off.
  // These values identify the Firebase project; they are not passwords. Access is controlled by the Firestore rules.
  firebase: {
    apiKey: "AIzaSyCf1SH2z2HCT-EpeQqwyGeJPPm7QmPJYVg",
    authDomain: "out-and-about-9d09e.firebaseapp.com",
    projectId: "out-and-about-9d09e",
    storageBucket: "out-and-about-9d09e.firebasestorage.app",
    messagingSenderId: "334139816557",
    appId: "1:334139816557:web:f7d19f121410f27ededd64"
  },
  beanThereUrl: "https://amabelnapitu.github.io/bean-there-by-putri/"
};
