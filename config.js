// Public configuration for the GitHub Pages site. The anon key is public by design
// (every browser that opens the InLane app receives it); it can only call the
// sanitized monitoring_feed_* functions from setup.sql. NEVER put a service-role
// key in this file.
window.MONITOR_CONFIG = {
  supabaseUrl: "https://csnzgfzxnscumvjefpon.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbnpnZnp4bnNjdW12amVmcG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjMyODEyMDksImV4cCI6MjAzODg1NzIwOX0.Go70qkJn_MsIjU9QgRy1HbIUGmY-M7wmNg6MU77VaDk",
};

