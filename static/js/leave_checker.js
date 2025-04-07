"use strict";

document.addEventListener("DOMContentLoaded", function () {
  console.log("DOMContentLoaded event fired");

  // Initialize markdown-it
  const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(str, { language: lang }).value;
        } catch (__) {}
      }
      return ""; // use external default escaping
    },
  });

  // Mobile menu toggle functionality
  const mobileMenuButton = document.getElementById("mobile-menu-button");
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener("click", () => {
      mobileMenu.classList.toggle("hidden");
    });
  }

  // Debug function to log messages with a timestamp
  function debugLog(message) {
    const now = new Date();
    const timestamp = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`;
    console.log(`[${timestamp}] ${message}`);
  }
  debugLog("DOM content loaded, setting up event listeners");

  // Set up back and forward navigation buttons
  const backButton = document.querySelector('.nav-button[data-action="back"]');
  const forwardButton = document.querySelector(
    '.nav-button[data-action="forward"]'
  );

  if (backButton) {
    debugLog("Back button found, adding event listener");
    backButton.addEventListener("click", function () {
      debugLog("Back button clicked");
      if (typeof navigateInApp === "function") {
        navigateInApp("back");
      } else {
        console.error("navigateInApp function not available");
      }
    });
  } else {
    console.warn("Back button not found");
  }

  if (forwardButton) {
    debugLog("Forward button found, adding event listener");
    forwardButton.addEventListener("click", function () {
      debugLog("Forward button clicked");
      if (typeof navigateInApp === "function") {
        navigateInApp("forward");
      } else {
        console.error("navigateInApp function not available");
      }
    });
  } else {
    console.warn("Forward button not found");
  }

  // Set active tab based on current URL for any tab items using "href"
  const tabItems = document.querySelectorAll(".tab-item");
  const currentPath = window.location.pathname;
  debugLog(`Current path: ${currentPath}, found ${tabItems.length} tab items`);

  tabItems.forEach((item) => {
    const href = item.getAttribute("href");
    debugLog(`Tab item href: ${href}`);

    if (href && currentPath.endsWith(href)) {
      item.classList.add("active");
      debugLog(`Set ${href} tab as active`);
    } else if (currentPath === "/" && href === "/") {
      item.classList.add("active");
      debugLog("Set home tab as active");
    }

    // For tabs that use a data-target instead of href, set up click events
    if (item.hasAttribute("data-target")) {
      debugLog(
        `Adding click event for tab with data-target: ${item.getAttribute(
          "data-target"
        )}`
      );
      item.addEventListener("click", function (e) {
        e.preventDefault();
        const targetId = this.getAttribute("data-target");
        debugLog(`Tab clicked with target: ${targetId}`);

        // Remove active class from all tabs
        tabItems.forEach((tab) => tab.classList.remove("active"));

        // Add active class to clicked tab
        this.classList.add("active");

        // Hide all tab contents
        const tabContents = document.querySelectorAll(".tab-content");
        tabContents.forEach((content) => (content.style.display = "none"));

        // Show selected tab content
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
          targetContent.style.display = "block";
          debugLog(`Displayed tab content: ${targetId}`);
        } else {
          debugLog(`Tab content with id ${targetId} not found`);
        }
      });
    }
  });

  // Set up login/signup tab switching in the auth section
  const authTabs = document.querySelectorAll(".auth-tab");
  debugLog(`Found ${authTabs.length} auth tabs`);

  authTabs.forEach((tab) => {
    debugLog(
      `Adding click event for auth tab: ${tab.getAttribute("data-tab")}`
    );
    tab.addEventListener("click", function () {
      const tabName = this.getAttribute("data-tab");
      debugLog(`Auth tab clicked: ${tabName}`);

      // Remove active class from all auth tabs
      authTabs.forEach((t) => t.classList.remove("active"));

      // Add active class to clicked tab
      this.classList.add("active");

      // Hide all forms
      document.querySelectorAll(".auth-form").forEach((form) => {
        form.classList.remove("active");
      });

      // Show the selected form
      const selectedForm = document.getElementById(tabName + "-form");
      if (selectedForm) {
        selectedForm.classList.add("active");
        debugLog(`Displayed form: ${tabName}-form`);
      } else {
        debugLog(`Form with id ${tabName}-form not found`);
      }
    });
  });

  // Electron-specific initialization
  if (window.electronAPI) {
    debugLog("Electron API detected, initializing");
    window.electronAPI.send("logToMain", "Leave Checker page initialized");
  } else {
    debugLog("Electron API not found");
  }

  // DOM Elements for the auth and leave checker sections
  const authSection = document.getElementById("auth-section");
  const leaveCheckerSection = document.getElementById("leave-checker-section");
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const leaveCheckForm = document.getElementById("leave-check-form");
  const loginError = document.getElementById("login-error");
  const signupError = document.getElementById("signup-error");
  const signupSuccess = document.getElementById("signup-success");
  const leaveError = document.getElementById("leave-error");
  const leaveResults = document.getElementById("leave-results");
  const leaveResultsContainer = document.getElementById(
    "leave-results-container"
  );
  const loading = document.getElementById("loading");
  const logoutBtn = document.getElementById("logout-btn");
  const userGreeting = document.getElementById("user-greeting");
  const copyResultsBtn = document.getElementById("copy-results");

  // Check if user is logged in
  function checkAuthStatus() {
    const userData = localStorage.getItem("leaveCheckerUser");
    if (userData) {
      // User is logged in
      const user = JSON.parse(userData);
      authSection.classList.add("hidden");
      leaveCheckerSection.classList.remove("hidden");

      // Update user greeting
      if (userGreeting && user.fullName) {
        userGreeting.textContent = `Welcome back, ${user.fullName}!`;
      }
    } else {
      // User is not logged in
      authSection.classList.remove("hidden");
      leaveCheckerSection.classList.add("hidden");
    }
  }
  checkAuthStatus();

  // Login form submission
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    debugLog("Login form submitted");

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    loginError.textContent = "";
    loginForm.querySelector(".btn").disabled = true;
    loginForm.querySelector(".btn").innerHTML =
      '<i class="ri-loader-4-line animate-spin"></i> Logging in...';

    try {
      debugLog("Sending login request to /api/leave/login");
      const response = await fetch("/api/leave/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      debugLog("Login response received: " + response.status);
      const data = await response.json();
      debugLog("Login data: " + JSON.stringify(data));

      if (data.success) {
        // Store user data in localStorage
        localStorage.setItem(
          "leaveCheckerUser",
          JSON.stringify({
            id: data.data.id,
            email: data.data.email,
            fullName: data.data.full_name,
          })
        );
        // Switch to leave checker section
        checkAuthStatus();
      } else {
        loginError.innerHTML = `<i class="ri-error-warning-line"></i> ${
          data.error || "Login failed. Please try again."
        }`;
      }
    } catch (error) {
      console.error("Login fetch error:", error);
      loginError.innerHTML = `<i class="ri-error-warning-line"></i> An error occurred. Please try again.`;
    } finally {
      loginForm.querySelector(".btn").disabled = false;
      loginForm.querySelector(".btn").innerHTML =
        '<i class="ri-login-circle-line"></i> Login';
    }
  });

  // Signup form submission
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    debugLog("Signup form submitted");

    const title = document.getElementById("signup-title").value;
    const name = document.getElementById("signup-name").value;
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;

    signupError.textContent = "";
    signupSuccess.textContent = "";
    signupForm.querySelector(".btn").disabled = true;
    signupForm.querySelector(".btn").innerHTML =
      '<i class="ri-loader-4-line animate-spin"></i> Signing up...';

    if (!title || !name || !email || !password) {
      signupError.innerHTML = `<i class="ri-error-warning-line"></i> All fields are required`;
      signupForm.querySelector(".btn").disabled = false;
      signupForm.querySelector(".btn").innerHTML =
        '<i class="ri-user-add-line"></i> Sign Up';
      return;
    }

    try {
      debugLog("Sending signup request to /api/leave/signup");
      const response = await fetch("/api/leave/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, name, email, password }),
      });

      debugLog("Signup response received: " + response.status);
      const data = await response.json();
      debugLog("Signup data: " + JSON.stringify(data));

      if (data.success) {
        signupSuccess.innerHTML = `<i class="ri-check-line"></i> Registration successful! You can now log in.`;
        signupForm.reset();

        // Switch to login tab after successful signup
        setTimeout(() => {
          document.getElementById("login-tab").click();
        }, 1500);
      } else {
        signupError.innerHTML = `<i class="ri-error-warning-line"></i> ${
          data.error || "Registration failed. Please try again."
        }`;
      }
    } catch (error) {
      console.error("Signup fetch error:", error);
      signupError.innerHTML = `<i class="ri-error-warning-line"></i> An error occurred. Please try again.`;
    } finally {
      signupForm.querySelector(".btn").disabled = false;
      signupForm.querySelector(".btn").innerHTML =
        '<i class="ri-user-add-line"></i> Sign Up';
    }
  });

  // Leave check form submission
  leaveCheckForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    debugLog("Leave check form submitted");

    const month = document.getElementById("month-input").value;

    // Get user data from localStorage
    const userData = JSON.parse(localStorage.getItem("leaveCheckerUser"));
    debugLog("User data for leave check: " + JSON.stringify(userData));

    if (!userData || !userData.fullName) {
      leaveError.innerHTML = `<i class="ri-error-warning-line"></i> User information not found. Please log in again.`;
      return;
    }

    leaveError.textContent = "";
    leaveResults.textContent = "";
    leaveResultsContainer.classList.add("hidden");
    loading.style.display = "flex";
    leaveCheckForm.querySelector(".btn").disabled = true;
    leaveCheckForm.querySelector(".btn").innerHTML =
      '<i class="ri-loader-4-line animate-spin"></i> Fetching...';

    try {
      debugLog("Sending leave check request to /api/leave/check");
      const response = await fetch("/api/leave/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ month, employeeName: userData.fullName }),
      });

      debugLog("Leave check response received: " + response.status);
      const data = await response.json();
      debugLog("Leave check data: " + JSON.stringify(data));

      loading.style.display = "none";

      if (data.success) {
        // Render the markdown content
        leaveResults.innerHTML = md.render(data.formattedData);
        leaveResultsContainer.classList.remove("hidden");

        // Apply syntax highlighting to any code blocks
        document.querySelectorAll("pre code").forEach((block) => {
          hljs.highlightElement(block);
        });
      } else {
        leaveError.innerHTML = `<i class="ri-error-warning-line"></i> ${
          data.error || "Failed to fetch leave data. Please try again."
        }`;
      }
    } catch (error) {
      console.error("Leave check fetch error:", error);
      loading.style.display = "none";
      leaveError.innerHTML = `<i class="ri-error-warning-line"></i> An error occurred. Please try again.`;
    } finally {
      leaveCheckForm.querySelector(".btn").disabled = false;
      leaveCheckForm.querySelector(".btn").innerHTML =
        '<i class="ri-search-line"></i> Fetch Leave Details';
    }
  });

  // Copy results to clipboard
  if (copyResultsBtn) {
    copyResultsBtn.addEventListener("click", () => {
      const textToCopy = leaveResults.textContent;
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          copyResultsBtn.innerHTML = '<i class="ri-check-line"></i>';
          setTimeout(() => {
            copyResultsBtn.innerHTML = '<i class="ri-clipboard-line"></i>';
          }, 2000);
        })
        .catch((err) => {
          console.error("Failed to copy text: ", err);
        });
    });
  }

  // Logout button action
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("leaveCheckerUser");
    checkAuthStatus();
    // Reset forms
    loginForm.reset();
    signupForm.reset();
    leaveCheckForm.reset();
    loginError.textContent = "";
    signupError.textContent = "";
    signupSuccess.textContent = "";
    leaveError.textContent = "";
    leaveResults.textContent = "";
    leaveResultsContainer.classList.add("hidden");
  });

  // Form validation
  function initializeValidators() {
    const loginEmailInput = document.getElementById("login-email");
    const loginPasswordInput = document.getElementById("login-password");
    const signupTitleInput = document.getElementById("signup-title");
    const signupNameInput = document.getElementById("signup-name");
    const signupEmailInput = document.getElementById("signup-email");
    const signupPasswordInput = document.getElementById("signup-password");

    [
      loginEmailInput,
      loginPasswordInput,
      signupTitleInput,
      signupNameInput,
      signupEmailInput,
      signupPasswordInput,
    ].forEach((input) => {
      input.addEventListener("blur", function () {
        if (!this.value.trim()) {
          this.classList.add("invalid");
        } else {
          this.classList.remove("invalid");
        }
      });
    });
  }
  initializeValidators();

  // Manual click handlers for auth tabs (redundant for robustness)
  document.getElementById("login-tab").onclick = function () {
    debugLog("Login tab clicked directly");
    document.getElementById("login-tab").classList.add("active");
    document.getElementById("signup-tab").classList.remove("active");
    document.getElementById("login-form").classList.add("active");
    document.getElementById("signup-form").classList.remove("active");
  };

  document.getElementById("signup-tab").onclick = function () {
    debugLog("Signup tab clicked directly");
    document.getElementById("signup-tab").classList.add("active");
    document.getElementById("login-tab").classList.remove("active");
    document.getElementById("signup-form").classList.add("active");
    document.getElementById("login-form").classList.remove("active");
  };
});
