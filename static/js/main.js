"use strict";

// Global variables and state
let isLoading = false;
let timeRemaining = 900; // 15 minutes in seconds
let timerInterval;
let emailCount = 0;
let currentEmailData = null;
let activeEmailItem = null;

/* --------------------------
   Function Declarations
--------------------------- */
function startAutoFetchTimer() {
  if (localStorage.getItem("autoFetchCompleted") === "true") {
    timeRemaining = 0;
    updateTimerDisplay();
    return;
  }
  let start = localStorage.getItem("autoFetchStart");
  if (!start) {
    start = Date.now();
    localStorage.setItem("autoFetchStart", start);
    timeRemaining = 900;
  } else {
    start = parseInt(start, 10);
    const elapsed = Math.floor((Date.now() - start) / 1000);
    timeRemaining = 900 - elapsed;
  }
  if (timeRemaining <= 0) {
    startFetch();
    localStorage.setItem("autoFetchCompleted", "true");
    timeRemaining = 0;
    updateTimerDisplay();
    return;
  }
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    timeRemaining = 900 - elapsed;
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      startFetch();
      localStorage.setItem("autoFetchCompleted", "true");
      timeRemaining = 0;
    }
    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  document.getElementById("countdown").textContent =
    `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

function showLoadingState() {
  document.getElementById("fetch-spinner").classList.remove("hidden");
  document.getElementById("fetch-btn").disabled = true;
  updateStatusIndicator("processing", "Fetching emails...");
  isLoading = true;
}

function hideLoadingState() {
  document.getElementById("fetch-spinner").classList.add("hidden");
  document.getElementById("fetch-btn").disabled = false;
  updateStatusIndicator(
    emailCount > 0 ? "success" : "warning",
    emailCount > 0 ? `${emailCount} emails loaded` : "No emails found"
  );
  isLoading = false;
}

function updateStatusIndicator(status, message) {
  const indicator = document.getElementById("status-indicator");
  const statusText = document.getElementById("status-text");
  if (!indicator || !statusText) return;
  indicator.classList.remove(
    "ready",
    "processing",
    "success",
    "error",
    "warning"
  );
  indicator.classList.add(status);
  statusText.textContent = message || "Ready to process emails";
}

function addEmailSummary(summary, reply, messageId, toEmail, subject) {
  hideLoadingState();
  emailCount++;
  console.log("Adding email summary:", {
    summary_length: summary ? summary.length : 0,
    has_message_id: !!messageId,
    has_to_email: !!toEmail,
    subject: subject,
  });

  let sub = subject || "No Subject";
  let from = "Unknown";
  let fromEmail = "";
  let preview = "No preview available";
  let date = "Today";

  if (typeof summary === "string") {
    const lines = summary.split("\n");
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      if (line.startsWith("Subject:") && !sub) {
        sub = line.substring(8).trim();
      } else if (line.startsWith("From:")) {
        from = line.substring(5).trim();
        const emailMatch = from.match(/<([^>]+)>/);
        if (emailMatch) {
          fromEmail = emailMatch[1];
          from = from.replace(/<.*>/, "").trim();
        }
      } else if (line.startsWith("Date:")) {
        date = line.substring(5).trim();
      } else if (line.startsWith("Preview:")) {
        preview = line.substring(8).trim();
      } else if (i > 3 && line.length > 10 && !line.includes(":") && !preview) {
        preview = line.trim();
        break;
      }
    }
    if (preview === "No preview available") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length > 10 && !line.includes(":")) {
          preview = line;
          break;
        }
      }
    }
  }

  const avatarColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
  const initials =
    from
      .split(" ")
      .map((name) => (name ? name[0] : ""))
      .join("")
      .substring(0, 2)
      .toUpperCase() || "NA";

  const list = document.getElementById("emailList");
  const noEmailsMessage = document.getElementById("noEmailsMessage");
  if (noEmailsMessage) {
    noEmailsMessage.style.display = "none";
  }

  const formattedDate = date || "Today";
  const emailItem = document.createElement("div");
  emailItem.className = "email-item animate-fade-in-up";
  emailItem.style.animationDelay = emailCount * 0.05 + "s";
  const emailId =
    messageId ||
    `email-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  emailItem.setAttribute("data-id", emailId);

  emailItem.innerHTML = `
    <div style="display: flex; gap: 12px;">
      <div class="email-item-avatar" style="background-color: ${avatarColor}">
        ${initials}
      </div>
      <div class="email-item-content">
        <div class="email-item-header">
          <div class="email-item-sender">${from}</div>
          <div class="email-item-time">${formattedDate}</div>
        </div>
        <div class="email-item-subject">${sub}</div>
        <div class="email-item-preview">${preview}</div>
      </div>
    </div>`;

  if (!currentEmailData) currentEmailData = {};
  currentEmailData[emailId] = {
    summary: summary,
    reply: reply,
    message_id: messageId,
    to_email: toEmail,
    subject: sub,
    from: from,
    from_email: fromEmail,
    date: formattedDate,
    initials: initials,
    avatarColor: avatarColor,
  };

  emailItem.onclick = function () {
    console.log("Email clicked:", sub);
    selectEmail(this, currentEmailData[emailId]);
  };

  list.insertBefore(emailItem, list.firstChild);
}

function selectEmail(emailElement, emailData) {
  if (activeEmailItem) {
    activeEmailItem.classList.remove("active");
  }
  activeEmailItem = emailElement;
  emailElement.classList.add("active");
  currentEmailData = emailData;
  document.getElementById("emailContent").style.display = "none";
  document.getElementById("emailDetails").style.display = "block";
  displayEmailDetails(emailData);
}

function displayEmailDetails(emailData) {
  const emailDetailsDiv = document.getElementById("emailDetails");
  if (!emailDetailsDiv) {
    console.error("Email details container not found");
    return;
  }
  console.log("Displaying email details for:", emailData.subject);
  let from = emailData.from || "";
  let fromEmail = emailData.from_email || "";
  let subject = emailData.subject || "";
  let date = emailData.date || "Today";
  let summaryText = "";

  if (emailData.summary) {
    const lines = emailData.summary.split("\n");
    if (lines.some((line) => line.trim().startsWith("Summary:"))) {
      const summaryIdx = lines.findIndex((line) =>
        line.trim().startsWith("Summary:")
      );
      summaryText = lines[summaryIdx].replace("Summary:", "").trim();
      for (let i = summaryIdx + 1; i < lines.length; i++) {
        if (lines[i].includes(":") && !lines[i].includes(" ")) break;
        summaryText += "\n" + lines[i];
      }
    } else {
      summaryText = emailData.summary;
    }
  }

  if (!summaryText) {
    summaryText = "No summary available for this email.";
  }

  const keyPoints = extractKeyPoints(emailData.summary || "");
  const initials =
    from
      .split(" ")
      .map((name) => (name ? name[0] : ""))
      .join("")
      .substring(0, 2)
      .toUpperCase() || "NA";
  const avatarColor =
    emailData.avatarColor ||
    `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;

  emailDetailsDiv.innerHTML = `
    <div class="email-header">
      <div class="email-sender">
        <div class="avatar" style="background-color: ${avatarColor}">${initials}</div>
        <div>
          <div class="email-subject">${subject}</div>
          <div class="email-meta">
            <div class="from">From: ${from} ${fromEmail ? `<${fromEmail}>` : ""}</div>
            <div class="date">${date}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="email-section">
      <div class="section-header">
        <svg class="section-icon" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        Summary
      </div>
      <div class="summary-content">${summaryText}</div>
    </div>
    <div class="email-section">
      <div class="section-header">
        <svg class="section-icon" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
        Key Points
      </div>
      <div class="key-points">
        ${
          keyPoints.length > 0
            ? keyPoints
                .map(
                  (point, idx) => `
          <div class="key-point" style="animation-delay: ${idx * 0.1}s">
            <div class="point-number">${idx + 1}</div>
            <div>${point}</div>
          </div>
        `
                )
                .join("")
            : `<div class="key-point">
                <div class="point-number">1</div>
                <div>No key points available for this email.</div>
              </div>`
        }
      </div>
    </div>
    <div class="email-section" id="replySection">
      <div class="section-header">
        <svg class="section-icon" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M5 12h14"></path>
          <path d="M12 5l7 7-7 7"></path>
        </svg>
        Suggested Reply
      </div>
      <div class="reply-box">
        <textarea
          id="replyText"
          class="textarea"
          placeholder="Type your reply here..."
        ></textarea>
        <div class="reply-actions">
          <div class="reply-info">
            <div>
              To: <span id="replyToAddress">${
                fromEmail || "Unknown recipient"
              }</span>
            </div>
            <div>
              Subject: <span id="replySubject">Re: ${
                subject || "No subject"
              }</span>
            </div>
          </div>
          <button id="sendReplyBtn" class="action-button" onclick="sendReply()">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            <span>Send Reply</span>
          </button>
        </div>
      </div>
    </div>
  `;
  const replyTextarea = document.getElementById("replyText");
  if (replyTextarea && emailData.reply) {
    replyTextarea.value = emailData.reply;
  }
}

function sendReply() {
  const replyTextarea = document.getElementById("replyText");
  if (!replyTextarea) {
    console.error("Reply textarea not found");
    return;
  }
  const replyText = replyTextarea.value.trim();
  console.log("Reply text length:", replyText.length);
  console.log("Reply text first 50 chars:", replyText.substring(0, 50));
  if (!replyText) {
    alert("Please enter a reply message");
    return;
  }
  if (!currentEmailData) {
    console.error("No email selected or missing data");
    updateStatusIndicator("error", "Cannot send reply: No email selected");
    return;
  }
  console.log(
    "Sending reply to:",
    currentEmailData.from_email || currentEmailData.to_email
  );
  const sendBtn = document.getElementById("sendReplyBtn");
  if (!sendBtn) {
    console.error("Send button not found");
    return;
  }
  const originalBtnText = sendBtn.innerHTML;
  sendBtn.innerHTML = `
    <div class="spinner"></div>
    <span>Sending...</span>
  `;
  sendBtn.disabled = true;
  updateStatusIndicator("processing", "Sending reply...");
  const payload = {
    body: replyText,
    message_id: currentEmailData.message_id,
    to_email: currentEmailData.from_email || currentEmailData.to_email,
    subject: "Re: " + currentEmailData.subject,
  };
  console.log("Sending payload:", payload);
  fetch("/api/emails/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((response) => {
      console.log("Reply response status:", response.status);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log("Reply response data:", data);
      if (data.success) {
        sendBtn.innerHTML = `
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="white" stroke-width="2" stroke-linecap="round"
            stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Sent!</span>
        `;
        sendBtn.style.backgroundColor = "var(--success)";
        updateStatusIndicator("success", "Reply sent successfully");
        setTimeout(() => {
          sendBtn.innerHTML = originalBtnText;
          sendBtn.style.backgroundColor = "";
          sendBtn.disabled = false;
        }, 2000);
      } else {
        sendBtn.innerHTML = originalBtnText;
        sendBtn.disabled = false;
        updateStatusIndicator("error", data.message || "Failed to send reply");
      }
    })
    .catch((error) => {
      console.error("Error sending reply:", error);
      sendBtn.innerHTML = originalBtnText;
      sendBtn.disabled = false;
      updateStatusIndicator("error", `Failed to send reply: ${error.message}`);
    });
}

function extractKeyPoints(summary) {
  const keyPoints = [];
  const keyPointsMatch = summary.match(/Key Points:(.*?)(?=(\n\n|$))/s);
  if (keyPointsMatch && keyPointsMatch[1]) {
    const pointsText = keyPointsMatch[1].trim();
    const bulletPoints = pointsText
      .split(/\n+\s*[-•*]\s*/)
      .filter((p) => p.trim());
    if (bulletPoints.length > 0) {
      const firstPoint = bulletPoints[0].trim();
      if (firstPoint && !firstPoint.startsWith("Key Points:")) {
        keyPoints.push(firstPoint);
      }
      for (let i = 1; i < bulletPoints.length; i++) {
        if (bulletPoints[i].trim()) {
          keyPoints.push(bulletPoints[i].trim());
        }
      }
    } else {
      const lines = pointsText.split("\n").filter((p) => p.trim());
      for (const line of lines) {
        keyPoints.push(line.trim());
      }
    }
  }
  if (keyPoints.length === 0) {
    return generateKeyPointsFromSummary(summary);
  }
  return keyPoints;
}

function generateKeyPointsFromSummary(summaryText) {
  const keyPoints = [];
  let cleanSummary = summaryText;
  const summaryMatch = summaryText.match(
    /Summary:(.*?)(?=(Key Points:|Body:|$))/s
  );
  if (summaryMatch && summaryMatch[1].trim()) {
    cleanSummary = summaryMatch[1].trim();
  } else if (summaryText.includes("Body:")) {
    const bodyMatch = summaryText.match(/Body:(.*?)(?=$)/s);
    if (bodyMatch && bodyMatch[1].trim()) {
      cleanSummary = bodyMatch[1].trim();
    }
  }
  const sentences = cleanSummary
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 15);
  for (let i = 0; i < Math.min(3, sentences.length); i++) {
    const sentence = sentences[i].trim();
    if (sentence) {
      keyPoints.push(sentence + ".");
    }
  }
  if (keyPoints.length === 0 && summaryText.length > 50) {
    const textLength = cleanSummary.length;
    const chunkSize = Math.floor(textLength / 3);
    for (let i = 0; i < 3; i++) {
      const start = i * chunkSize;
      const end = Math.min((i + 1) * chunkSize, textLength);
      const chunk = cleanSummary.substring(start, end).trim();
      if (chunk.length > 0) {
        let point = chunk.substring(0, 60);
        if (chunk.length > 60) point += "...";
        keyPoints.push(point);
      }
    }
  }
  return keyPoints;
}

function startFetch() {
  if (isLoading) return;
  showLoadingState();
  console.log("Starting email fetch...");
  updateStatusIndicator("processing", "Fetching emails...");
  let evtSource;
  try {
    evtSource = new EventSource("/api/emails/fetch");
  } catch (error) {
    console.error("Error creating EventSource:", error);
    updateStatusIndicator("error", "Connection error");
    hideLoadingState();
    return;
  }
  let emailsReceived = 0;
  let hasConnected = false;
  evtSource.onmessage = function (event) {
    try {
      hasConnected = true;
      console.log("SSE message received:", event.data);
      const data = JSON.parse(event.data);
      if (data.type === "email_summary") {
        console.log("Email summary received:", data.data.subject);
        emailsReceived++;
        const d = data.data;
        console.log("Summary data structure:", {
          summary_length: d.summary ? d.summary.length : 0,
          summary_starts_with: d.summary
            ? d.summary.substring(0, 30) + "..."
            : "N/A",
          has_reply: !!d.reply,
          reply_length: d.reply ? d.reply.length : 0,
          message_id: d.message_id,
          to_email: d.to_email,
          subject: d.subject,
        });
        if (!d.summary || d.summary.trim() === "") {
          console.warn("Empty summary received, using placeholder");
          d.summary = `From: ${d.from || "Unknown"}\nSubject: ${
            d.subject || "No Subject"
          }\n\nSummary: No summary available for this email.`;
        }
        let formattedReply = "";
        if (d.reply) {
          formattedReply = d.reply.trim();
          console.log("AI reply received, length:", formattedReply.length);
          console.log(
            "AI reply preview:",
            formattedReply.substring(0, 50) + "..."
          );
        } else {
          formattedReply =
            "Thank you for your email. I'll get back to you shortly.";
          console.log("No AI reply received, using default");
        }
        addEmailSummary(
          d.summary,
          formattedReply,
          d.message_id,
          d.to_email,
          d.subject
        );
      } else if (data.type === "status") {
        updateStatusIndicator("processing", data.message);
      } else if (data.type === "progress") {
        console.log("Progress:", data.message);
      } else if (data.type === "completed") {
        console.log("Fetch completed:", data.message);
        updateStatusIndicator("success", data.message);
        evtSource.close();
        hideLoadingState();
      } else if (data.type === "error") {
        console.error("Fetch error:", data.message);
        updateStatusIndicator("error", data.message);
        evtSource.close();
        hideLoadingState();
      }
    } catch (error) {
      console.error("Error processing SSE message:", error);
      updateStatusIndicator("error", "Error processing data");
      evtSource.close();
      hideLoadingState();
    }
  };

  evtSource.onerror = function (error) {
    console.error("SSE connection error:", error);
    updateStatusIndicator("error", "Connection error");
    evtSource.close();
    hideLoadingState();
  };

  setTimeout(() => {
    if (isLoading) {
      console.log("Fetch timeout - closing connection");
      evtSource.close();
      hideLoadingState();
      updateStatusIndicator("warning", "Fetch timed out");
    }
  }, 30000);
}

/* --------------------------
   Initialization Code
--------------------------- */
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOMContentLoaded event fired");

  // Mobile menu toggle functionality
  const mobileMenuButton = document.getElementById("mobile-menu-button");
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener("click", () => {
      mobileMenu.classList.toggle("hidden");
    });
  }

  if (window.electron) {
    document.body.classList.add("electron");
    console.log("Running in Electron environment");
  }

  // Set up back and forward navigation buttons
  const backButton = document.querySelector('.nav-button[data-action="back"]');
  if (backButton) {
    backButton.addEventListener("click", function () {
      console.log("Back button clicked");
      if (typeof navigateInApp === "function") {
        navigateInApp("back");
      } else if (window.electron && window.electron.navigateInApp) {
        window.electron.navigateInApp("back");
      } else {
        console.error("Navigation function not available");
      }
    });
  }

  const forwardButton = document.querySelector('.nav-button[data-action="forward"]');
  if (forwardButton) {
    forwardButton.addEventListener("click", function () {
      console.log("Forward button clicked");
      if (typeof navigateInApp === "function") {
        navigateInApp("forward");
      } else if (window.electron && window.electron.navigateInApp) {
        window.electron.navigateInApp("forward");
      } else {
        console.error("Navigation function not available");
      }
    });
  }

  // Set active tab based on current URL
  const currentPath = window.location.pathname;
  const tabItems = document.querySelectorAll(".tab-item");
  tabItems.forEach((tab) => {
    const href = tab.getAttribute("href");
    if (href && currentPath.includes(href.substring(1))) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Initialize the auto-fetch timer
  startAutoFetchTimer();

  console.log("Email summarizer initialized");

  const fetchBtn = document.getElementById("fetch-btn");
  if (fetchBtn) {
    fetchBtn.addEventListener("click", startFetch);
  }
});
