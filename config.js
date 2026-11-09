// Where Out & About gets its data. Each link is a tab of the Review sheet published as CSV
// (File → Share → Publish to web → pick the tab → Comma-separated values).
// Leave a link empty to use the saved copy in the data folder instead.
window.OUT_AND_ABOUT_CONFIG = {
  cafesCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQM22to-Oh9Zy1PjmVIxg7vClM4w9w1bWhlO4x2Tnw7AjTX0VoX4FE4bkBzZKERBnHtgDHwGMYkps5e/pub?gid=1901912852&single=true&output=csv", // APP tab
  foodCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQM22to-Oh9Zy1PjmVIxg7vClM4w9w1bWhlO4x2Tnw7AjTX0VoX4FE4bkBzZKERBnHtgDHwGMYkps5e/pub?gid=382672132&single=true&output=csv", // FOOD tab
  barsCsvUrl: "",    // BAR tab: paste its published CSV link here once it's set up
  dessertCsvUrl: "", // DESSERT tab: paste its published CSV link here once it's set up
  branchesCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQM22to-Oh9Zy1PjmVIxg7vClM4w9w1bWhlO4x2Tnw7AjTX0VoX4FE4bkBzZKERBnHtgDHwGMYkps5e/pub?gid=1996833004&single=true&output=csv", // BRANCHES tab (filled in by the monthly check)
  // The same Apps Script web app as Bean There: votes, notes and "has this closed?" reports.
  apiUrl: "https://script.google.com/macros/s/AKfycbyYj61cIkk6NVqXG_2-xLskuCujgzIE-ijwffMfdOBDeJYzN25AVo9pYVFIh_HOpt68/exec",
  beanThereUrl: "https://amabelnapitu.github.io/bean-there-by-putri/"
};
