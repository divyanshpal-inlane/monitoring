// Public configuration for the GitHub Pages site. The anon key is public by design
// (every browser that opens the InLane app receives it); it can only call the
// sanitized monitoring_feed_* functions from setup.sql. NEVER put a service-role
// key in this file.
window.MONITOR_CONFIG = {
  supabaseUrl: "https://csnzgfzxnscumvjefpon.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbnpnZnp4bnNjdW12amVmcG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjMyODEyMDksImV4cCI6MjAzODg1NzIwOX0.Go70qkJn_MsIjU9QgRy1HbIUGmY-M7wmNg6MU77VaDk",
  // Login gate (public site only). Neither the ID nor the password is stored: this
  // is a salted PBKDF2-SHA256 hash of both. It keeps casual visitors out of the page;
  // it is NOT a security boundary (the data functions stay callable with the anon key).
  auth: { salt: "48ce3761273c8660d78912dddc08b1a0", iterations: 200000, hash: "e662bf09add3246559c07913360f9f4597407d55f992a5668531569f202b01f8" },
};


