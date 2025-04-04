"use strict";

// -------------------------------
// Global Variables and Utility Functions
// -------------------------------
var imageSelected = false;
var uploadedFilename = "";

function selectImage() {
  document.getElementById("fileInput").click();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  console.log(
    "Uploading file:",
    file.name,
    "Size:",
    file.size,
    "Type:",
    file.type
  );
  const formData = new FormData();
  // Append file with field name "file"
  formData.append("file", file);
  console.log("Form data created with file field");

  fetch("/api/objects/upload", {
    method: "POST",
    body: formData,
  })
    .then((response) => {
      console.log("Upload response status:", response.status);
      return response.json();
    })
    .then((data) => {
      console.log("Upload response data:", data);
      if (data.success) {
        // Store filename returned from the server
        uploadedFilename = data.filename;
        console.log("Server stored file as:", uploadedFilename);
        const imageUrl = URL.createObjectURL(file);
        setImageName(file.name, imageUrl);
      } else {
        alert("Error uploading image: " + data.error);
      }
    })
    .catch((error) => {
      console.error("Upload error:", error);
      alert("Upload failed: " + error.message);
    });
}

function setImageName(name, imageUrl) {
  document.getElementById("imageName").innerText = name;
  const uploadedImage = document.getElementById("uploadedImage");
  uploadedImage.src = imageUrl;
  // Hide upload section and show file info and image preview
  document.getElementById("uploadSection").classList.add("hidden");
  document.getElementById("fileInfo").classList.remove("hidden");
  document.getElementById("imageSection").classList.remove("hidden");
  document.getElementById("detectButton").disabled = false;
  imageSelected = true;
}

function performDetection() {
  if (!imageSelected) return;
  if (!uploadedFilename) {
    alert("No file has been uploaded to the server");
    return;
  }
  showDetectionInProgress();
  console.log("Sending detection request for file:", uploadedFilename);
  fetch("/api/objects/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: uploadedFilename }),
  })
    .then((response) => {
      console.log("Detection response status:", response.status);
      return response.json();
    })
    .then((data) => {
      console.log("Detection response data:", data);
      if (data.success) {
        displayDetectionResult(data.result);
      } else {
        updateStatus("Detection error: " + data.error, "error");
      }
    })
    .catch((error) => {
      console.error("Detection error:", error);
      updateStatus("Detection failed", "error");
    });
}

function showDetectionInProgress() {
  const detectSpinner = document.getElementById("detectSpinner");
  detectSpinner.classList.remove("hidden");
  updateStatus("Analyzing image and detecting objects...", "loading");
}

function updateStatus(message, type) {
  const statusEl = document.getElementById("status");
  statusEl.innerText = message;
  statusEl.classList.remove("hidden");
}

function displayDetectionResult(result) {
  document.getElementById("detectSpinner").classList.add("hidden");
  updateStatus("Detection completed successfully!", "success");
  let htmlContent = marked.parse(result);
  if (result.includes("%")) {
    const detections = [];
    result.split("\n").forEach((line) => {
      if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
        const match = line.match(/[*-]\s+(.*?)\s+\((\d+\.\d+)%\)/);
        if (match) {
          detections.push({
            name: match[1],
            confidence: parseFloat(match[2]),
          });
        }
      }
    });
    let visualHTML =
      '<div class="mb-4 font-semibold text-neutral-700">Detected Objects</div>';
    if (detections.length === 0) {
      visualHTML +=
        '<div class="text-center py-4 text-neutral-500">No objects detected in this image</div>';
    } else {
      detections.forEach((item) => {
        visualHTML += `
          <div class="detection-item">
            <div class="flex justify-between">
              <span class="font-medium text-neutral-800">${item.name}</span>
              <span class="text-primary-600 font-medium">${item.confidence.toFixed(
                1
              )}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-value" style="width: ${item.confidence}%"></div>
            </div>
          </div>
        `;
      });
    }
    htmlContent = visualHTML;
  }
  document.getElementById("result").innerHTML = htmlContent;
  document.getElementById("resultsSection").classList.remove("hidden");
}

// -------------------------------
// DOMContentLoaded Event - Attach All Event Listeners
// -------------------------------
document.addEventListener("DOMContentLoaded", function () {
  console.log("Object Detection DOM loaded");

  // Mobile menu toggle functionality
  const mobileMenuButton = document.getElementById("mobile-menu-button");
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener("click", () => {
      mobileMenu.classList.toggle("hidden");
    });
  }

  // File input change event
  const fileInput = document.getElementById("fileInput");
  if (fileInput) {
    fileInput.addEventListener("change", handleFileSelect);
  }

  // Setup back and forward navigation buttons
  const backButton = document.querySelector('.nav-button[data-action="back"]');
  const forwardButton = document.querySelector('.nav-button[data-action="forward"]');
  if (backButton) {
    backButton.addEventListener("click", function () {
      console.log("Back button clicked");
      if (typeof navigateInApp === "function") {
        navigateInApp("back");
      } else {
        console.error("navigateInApp function not available");
      }
    });
  }
  if (forwardButton) {
    forwardButton.addEventListener("click", function () {
      console.log("Forward button clicked");
      if (typeof navigateInApp === "function") {
        navigateInApp("forward");
      } else {
        console.error("navigateInApp function not available");
      }
    });
  }

  // Set active tab based on URL for tab items using href or data-target
  const tabItems = document.querySelectorAll(".tab-item");
  const currentPath = window.location.pathname;
  tabItems.forEach((item) => {
    const href = item.getAttribute("href");
    if (href && currentPath.endsWith(href)) {
      item.classList.add("active");
    } else if (currentPath === "/" && href === "/") {
      item.classList.add("active");
    }
    if (item.hasAttribute("data-target")) {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const targetId = item.getAttribute("data-target");
        tabItems.forEach((tab) => tab.classList.remove("active"));
        item.classList.add("active");
        const tabContents = document.querySelectorAll(".tab-content");
        tabContents.forEach((content) => (content.style.display = "none"));
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
          targetContent.style.display = "block";
        }
      });
    }
  });

  // Electron-specific initialization – if running in Electron
  if (window.electronAPI) {
    console.log("Object Detection page initialized in Electron");
    window.electronAPI.send("logToMain", "Object Detection page initialized");
  }
});

// -------------------------------
// Expose functions to global scope (for inline onclick attributes)
// -------------------------------
window.selectImage = selectImage;
window.performDetection = performDetection;
