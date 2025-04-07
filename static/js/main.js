"use strict";

// Global variables and state
let isLoading = false;
let timeRemaining = 900; // 15 minutes in seconds
let timerInterval;
let emailCount = 0;
let currentEmailData = null;
let activeEmailItem = null;
let emailsData = {};
let globalTimerStarted = false;
let activeFetchSource = null; // Track active EventSource

/* --------------------------
   Function Declarations
--------------------------- */

/**
 * On first session load, we initialize our session values.
 * We do not call a full sessionStorage.clear(), so that keys set in a previous page are preserved.
 */
function initSessionIfNeeded() {
  if (!sessionStorage.getItem("appInitialized")) {
    console.log("New session detected - initializing session keys");
    // Instead of clearing everything, remove only keys we use:
    sessionStorage.removeItem("emailsData");
    sessionStorage.removeItem("emailCount");
    sessionStorage.removeItem("globalTimerStart");
    sessionStorage.removeItem("globalTimerLastCheck");
    sessionStorage.setItem("appInitialized", "true");
    // Trigger an immediate fetch for fresh state
    setTimeout(() => {
      if (!isLoading) {
        startFetch();
      }
    }, 1000);
    return true;
  }
  return false;
}

function startAutoFetchTimer() {
  // Only call initSessionIfNeeded once.
  initSessionIfNeeded();

  // Use sessionStorage to track our global timer so that switching pages
  // preserves the value.
  if (sessionStorage.getItem("globalTimerStart")) {
    console.log("Existing timer found, syncing...");
    syncTimerFromStorage();
  } else {
    console.log("No timer found, initializing new timer...");
    initializeGlobalTimer();
  }
}

function initializeGlobalTimer() {
  console.log("Initializing global timer");
  const now = Date.now();
  sessionStorage.setItem("globalTimerStart", now.toString());
  sessionStorage.setItem("globalTimerLastCheck", now.toString());
  timeRemaining = 900;
  updateTimerDisplay();
  startGlobalTimerInterval();
  globalTimerStarted = true;
}

function syncTimerFromStorage() {
  console.log("Syncing timer from storage");
  const timerStart = sessionStorage.getItem("globalTimerStart");

  if (!timerStart) {
    console.log("No timer found in storage, initializing");
    initializeGlobalTimer();
    return;
  }

  const startTime = parseInt(timerStart, 10);
  const now = Date.now();
  const elapsed = Math.floor((now - startTime) / 1000);
  timeRemaining = Math.max(0, 900 - elapsed);

  if (timeRemaining <= 0) {
    console.log("Timer expired during absence, resetting");
    if (!isLoading) {
      startFetch();
    }
    initializeGlobalTimer();
  } else {
    console.log(`Timer synced: ${timeRemaining} seconds remaining`);
    updateTimerDisplay();
    startGlobalTimerInterval();
    globalTimerStarted = true;
  }

  sessionStorage.setItem("globalTimerLastCheck", now.toString());
}

function startGlobalTimerInterval() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  timerInterval = setInterval(() => {
    // Only run the timer if we're on the email page.
    if (!window.location.pathname.includes("/email")) {
      clearInterval(timerInterval);
      return;
    }

    const timerStart = sessionStorage.getItem("globalTimerStart");
    if (!timerStart) {
      console.error("Timer start not found in storage");
      clearInterval(timerInterval);
      initializeGlobalTimer();
      return;
    }

    const startTime = parseInt(timerStart, 10);
    const now = Date.now();
    const elapsed = Math.floor((now - startTime) / 1000);
    timeRemaining = Math.max(0, 900 - elapsed);
    sessionStorage.setItem("globalTimerLastCheck", now.toString());

    if (timeRemaining <= 0) {
      console.log("Timer reached zero, triggering fetch");
      clearInterval(timerInterval);
      if (!isLoading) {
        startFetch();
      }
      initializeGlobalTimer();
    }
    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timerElement = document.getElementById("countdown");
  if (timerElement) {
    timerElement.textContent = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  }
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

  // Persist email data in sessionStorage
  emailsData[emailId] = {
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

  saveEmailsToStorage();
  emailItem.onclick = function() {
    console.log("Email clicked:", sub);
    selectEmail(this, emailsData[emailId]);
  };
  list.insertBefore(emailItem, list.firstChild);
}

function saveEmailsToStorage() {
  try {
    sessionStorage.setItem("emailsData", JSON.stringify(emailsData));
    sessionStorage.setItem("emailCount", emailCount.toString());
  } catch (e) {
    console.error("Error saving emails to sessionStorage:", e);
  }
}

function loadEmailsFromStorage() {
  try {
    const storedEmails = sessionStorage.getItem("emailsData");
    const storedCount = sessionStorage.getItem("emailCount");
    if (storedEmails) {
      emailsData = JSON.parse(storedEmails);
      emailCount = storedCount ? parseInt(storedCount, 10) : 0;
      // Populate the email list
      const list = document.getElementById("emailList");
      const noEmailsMessage = document.getElementById("noEmailsMessage");
      if (Object.keys(emailsData).length > 0) {
        if (noEmailsMessage) {
          noEmailsMessage.style.display = "none";
        }
        // Sort emails by date (newest first)
        const sortedEmailIds = Object.keys(emailsData).sort((a, b) => {
          const dateA = new Date(emailsData[a].date);
          const dateB = new Date(emailsData[b].date);
          return dateB - dateA;
        });
        list.innerHTML = "";
        sortedEmailIds.forEach(emailId => {
          const email = emailsData[emailId];
          const emailItem = createEmailListItem(email);
          emailItem.onclick = function() {
            selectEmail(this, email);
          };
          list.appendChild(emailItem);
        });
      }
    }
  } catch (e) {
    console.error("Error loading emails from sessionStorage:", e);
  }
}

// Helper: Create a DOM element for an email list item
function createEmailListItem(email) {
  const emailItem = document.createElement("div");
  emailItem.className = "email-item";
  emailItem.setAttribute("data-id", email.message_id || "");
  emailItem.innerHTML = `
    <div style="display: flex; gap: 12px;">
      <div class="email-item-avatar" style="background-color: ${email.avatarColor}">
        ${email.initials}
      </div>
      <div class="email-item-content">
        <div class="email-item-header">
          <div class="email-item-sender">${email.from}</div>
          <div class="email-item-time">${email.date}</div>
        </div>
        <div class="email-item-subject">${email.subject}</div>
        <div class="email-item-preview">${
          email.summary
            ? email.summary.substring(0, 50) + "..."
            : "No preview available"
        }</div>
      </div>
    </div>`;
  return emailItem;
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
    if (lines.some(line => line.trim().startsWith("Summary:"))) {
      const summaryIdx = lines.findIndex(line =>
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
      .map(name => (name ? name[0] : ""))
      .join("")
      .substring(0, 2)
      .toUpperCase() || "NA";
  const avatarColor =
    emailData.avatarColor || `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
  emailDetailsDiv.innerHTML = `
    <div class="email-header">
      <div class="email-sender">
        <div class="avatar" style="background-color: ${avatarColor}">${initials}</div>
        <div>
          <div class="email-subject">${subject}</div>
          <div class="email-meta">
            <div class="from">From: ${from} ${
    fromEmail ? `<${fromEmail}>` : ""
  }</div>
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
      <div class="summary-content custom-scrollbar">${summaryText}</div>
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
      <div class="key-points custom-scrollbar">
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
        <textarea id="replyText" class="textarea custom-scrollbar" placeholder="Type your reply here..."></textarea>
        <div class="reply-actions">
          <div class="reply-info">
            <div>To: <span id="replyToAddress">${
              fromEmail || "Unknown recipient"
            }</span></div>
            <div>Subject: <span id="replySubject">Re: ${
              subject || "No subject"
            }</span></div>
          </div>
          <button id="sendReplyBtn" class="action-button" onclick="sendReply()">
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
    displayEmailReply(emailData);
  }
}

function formatEmailReply(reply) {
  // First remove any HTML tags
  let cleanReply = reply.replace(/<[^>]*>/g, "");

  // Decode HTML entities
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = cleanReply;
  cleanReply = tempDiv.textContent;

  // Fix common formatting issues
  cleanReply = cleanReply
    // Remove excessive whitespace
    .replace(/\s+/g, " ")
    // Ensure proper spacing after periods (but not in abbreviations)
    .replace(/(?<![A-Z])\.(?!\w)\s*/g, ". ")
    // Extract subject line if present
    .replace(/^(Re:.*?)(?:\n|$)/, "")
    // Format greeting properly
    .replace(/(Dear\s+[^,]+),?\s*/i, "$1,\n\n")
    // Format closing properly
    .replace(
      /\s*(Best regards|Sincerely|Thanks|Thank you|Regards|Yours truly|Cheers),?\s*/i,
      "\n\n$1,\n"
    )
    // Ensure name is on a new line after closing
    .replace(/,\s*([A-Za-z]+)$/, ",\n\n$1")
    // Ensure proper paragraph breaks
    .replace(/\.\s+([A-Z])/g, ".\n\n$1")
    // Clean up any excessive line breaks
    .replace(/\n{3,}/g, "\n\n");

  return cleanReply.trim();
}

function displayEmailReply(emailData) {
  const replyTextarea = document.getElementById("replyText");
  if (replyTextarea && emailData.reply) {
    // Properly decode HTML content
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = emailData.reply;
    const decodedText = tempDiv.textContent || tempDiv.innerText;

    // Format the reply text
    const formattedReply = formatEmailReply(decodedText);

    // Set the value and adjust height
    replyTextarea.value = formattedReply;

    // Trigger a resize event to adjust height properly
    setTimeout(() => {
      replyTextarea.style.height = "auto";
      replyTextarea.style.height =
        Math.min(300, replyTextarea.scrollHeight) + "px";

      // Add event listener to auto-resize as user types
      if (!replyTextarea.dataset.resizeListenerAdded) {
        replyTextarea.addEventListener("input", function() {
          this.style.height = "auto";
          this.style.height = Math.min(300, this.scrollHeight) + "px";
        });
        replyTextarea.dataset.resizeListenerAdded = "true";
      }
    }, 10);
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
  sendBtn.innerHTML = `<div class="spinner"></div><span>Sending...</span>`;
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
    .then(response => {
      console.log("Reply response status:", response.status);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("Reply response data:", data);
      if (data.success) {
        sendBtn.innerHTML = `
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
    .catch(error => {
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
      .filter(p => p.trim());
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
      const lines = pointsText.split("\n").filter(p => p.trim());
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
  const summaryMatch = summaryText.match(/Summary:(.*?)(?=(Key Points:|Body:|$))/s);
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
    .filter(s => s.trim().length > 15);
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

  // If there's already an active fetch, reconnect instead.
  if (sessionStorage.getItem("fetchInProgress") === "true") {
    console.log("Fetch already in progress, reconnecting...");
    reconnectToFetch();
    return;
  }

  showLoadingState();
  console.log("Starting new email fetch...");
  updateStatusIndicator("processing", "Fetching emails...");
  initializeGlobalTimer();
  startFetchProcess();
}

function startFetchProcess() {
  try {
    activeFetchSource = new EventSource("/api/emails/fetch");
    sessionStorage.setItem("fetchInProgress", "true");

    activeFetchSource.onmessage = handleFetchMessage;
    activeFetchSource.onerror = handleFetchError;

    // Set timeout for fetch operation
    setTimeout(() => {
      if (isLoading && activeFetchSource) {
        console.log("Fetch timeout - closing connection");
        completeFetch("warning", "Fetch timed out");
      }
    }, 30000);
  } catch (error) {
    console.error("Error creating EventSource:", error);
    completeFetch("error", "Connection error");
  }
}

function handleFetchMessage(event) {
  try {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "email_summary":
        // If AI provided a reply, use it; otherwise, set a default.
        const d = data.data;
        const formattedReply = d.reply ? d.reply.replace(/\n/g, "<br>") : "";
        addEmailSummary(
          d.summary,
          formattedReply,
          d.message_id,
          d.to_email,
          d.subject
        );
        break;
      case "status":
        updateStatusIndicator("processing", data.message);
        sessionStorage.setItem("fetchStatus", data.message);
        break;
      case "progress":
        console.log("Progress:", data.message);
        sessionStorage.setItem("fetchProgress", JSON.stringify(data));
        break;
      case "completed":
        console.log("Fetch completed:", data.message);
        completeFetch("success", data.message);
        break;
      case "error":
        console.error("Fetch error:", data.message);
        completeFetch("error", data.message);
        break;
    }
  } catch (error) {
    console.error("Error processing SSE message:", error);
    completeFetch("error", "Error processing data");
  }
}

function handleFetchError(error) {
  console.error("SSE connection error:", error);
  if (document.visibilityState === "visible") {
    completeFetch("error", "Connection error");
  }
}

function completeFetch(status, message) {
  if (activeFetchSource) {
    activeFetchSource.close();
    activeFetchSource = null;
  }
  sessionStorage.removeItem("fetchInProgress");
  sessionStorage.removeItem("fetchStatus");
  sessionStorage.removeItem("fetchProgress");
  hideLoadingState();
  updateStatusIndicator(status, message);
  isLoading = false;
}

function reconnectToFetch() {
  console.log("Reconnecting to ongoing fetch...");
  showLoadingState();
  const lastStatus = sessionStorage.getItem("fetchStatus");
  if (lastStatus) {
    updateStatusIndicator("processing", lastStatus);
  }
  startFetchProcess();
}

function checkPageVisibility() {
  if (document.visibilityState === "visible") {
    console.log("Page became visible");
    if (
      window.location.pathname.includes("/email") &&
      sessionStorage.getItem("fetchInProgress") === "true"
    ) {
      console.log("Reconnecting to fetch after page switch");
      reconnectToFetch();
    }
    if (window.location.pathname.includes("/email")) {
      syncTimerFromStorage();
      loadEmailsFromStorage();
    }
  }
}

// Cleanup timer if navigating away from email page
function cleanupTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", function() {
  // If we're on the email page, load any stored emails.
  if (window.location.pathname.includes("/email")) {
    loadEmailsFromStorage();
  }

  // Start the auto-fetch timer
  startAutoFetchTimer();

  document.addEventListener("visibilitychange", checkPageVisibility);

  const fetchBtn = document.getElementById("fetch-btn");
  if (fetchBtn) {
    fetchBtn.addEventListener("click", startFetch);
  }
});

// When the app is closed, the sessionStorage is automatically cleared.
// For page unload, we store the emails in sessionStorage so that on a page
// change they remain.
window.addEventListener("beforeunload", function() {
  saveEmailsToStorage()
    // If leaving the email page (but not the whole app), just close the active
  // fetch connection.
  if (activeFetchSource) {
    activeFetchSource.close();
    activeFetchSource = null;
  }

  // If we're navigating away from the email page, we can clean up our timer.
  if (!window.location.pathname.includes("/email")) {
    cleanupTimer();
  }
});

// Handle app closing in Electron
if (window.electron) {
  window.electron.onAppClosing(() => {
    completeFetch("info", "Application closing");
    sessionStorage.clear();
    cleanupTimer();
  });
}



