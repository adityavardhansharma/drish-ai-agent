// static/js/doc_summary.js

document.addEventListener('DOMContentLoaded', () => {
  console.log('Document Summary page loaded.');
  // Set initial status
  updateStatusIndicator('success', 'Ready to process documents');
});

// Mobile menu toggle functionality
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');

mobileMenuButton.addEventListener('click', () => {
  mobileMenu.classList.toggle('hidden');
});

// Global flags
let isFileSelected = false;
let isGeneratingSummary = false;
let documentContent = '';
let chatHistory = [];

// Setup Electron navigation if available
document.addEventListener('DOMContentLoaded', function () {
  if (window.electron) {
    document.body.classList.add('electron');
    console.log('Running in Electron environment');

    const backButton = document.getElementById('nav-back');
    const forwardButton = document.getElementById('nav-forward');

    if (backButton && forwardButton) {
      backButton.addEventListener('click', function () {
        console.log('Back button clicked');
        if (window.electron && window.electron.navigateInApp) {
          window.electron.navigateInApp('back');
        } else {
          console.error('Navigation function not available');
        }
      });

      forwardButton.addEventListener('click', function () {
        console.log('Forward button clicked');
        if (window.electron && window.electron.navigateInApp) {
          window.electron.navigateInApp('forward');
        } else {
          console.error('Navigation function not available');
        }
      });

      console.log('Navigation buttons setup complete');
    } else {
      console.error('Navigation buttons not found');
    }
  } else {
    console.log('Not running in Electron environment');
  }

  const documentTab = document.getElementById('documentTab');
  const settingsTab = document.getElementById('settingsTab');
  const documentTabBtn = document.getElementById('documentTabBtn');
  const settingsTabBtn = document.getElementById('settingsTabBtn');

  if (documentTabBtn && settingsTabBtn) {
    documentTabBtn.addEventListener('click', function () {
      documentTab.classList.add('active');
      settingsTab.classList.remove('active');
      documentTabBtn.classList.add('active');
      settingsTabBtn.classList.remove('active');
    });

    settingsTabBtn.addEventListener('click', function () {
      settingsTab.classList.add('active');
      documentTab.classList.remove('active');
      settingsTabBtn.classList.add('active');
      documentTabBtn.classList.remove('active');
    });
  }
});

// Unified file change handler
function handleFileChange(inputElement) {
  console.log('handleFileChange called with:', inputElement);
  let file;
  if (inputElement.target) {
    file = inputElement.target.files[0];
  } else if (inputElement.files) {
    file = inputElement.files[0];
  } else if (Array.isArray(inputElement)) {
    file = inputElement[0];
  }
  if (!file) {
    console.error('No file selected');
    return;
  }
  console.log('Selected file:', file.name, 'Type:', file.type, 'Size:', file.size);
  setFileName(file.name);
  updateStatusIndicator('success', 'Document selected');
  const formData = new FormData();
  formData.append('file', file);
  console.log("FormData created with file field name: 'file'");
  console.log('Starting file upload to /api/documents/upload');
  fetch('/api/documents/upload', {
    method: 'POST',
    body: formData,
  })
    .then((response) => {
      console.log('Upload response status:', response.status);
      return response.json();
    })
    .then((data) => {
      console.log('Upload response data:', data);
      if (data.success) {
        isFileSelected = true;
        updateStatusIndicator('success', 'Document uploaded successfully');
        console.log('File uploaded successfully, triggering summary generation');
        requestSummaryGeneration();
      } else {
        console.error('Upload failed:', data.error);
        updateStatusIndicator('error', data.error || 'Upload failed');
      }
    })
    .catch((error) => {
      console.error('Upload request error:', error);
      updateStatusIndicator('error', 'Upload failed: ' + error.message);
    });
}

function navigateTo(page) {
  window.location.href = '/' + page;
}

function updateStatusIndicator(status, message) {
  const indicator = document.getElementById('statusIndicator');
  if (!indicator) return;
  const statusClass = status || 'success';
  const statusMessage = message || 'Ready';
  indicator.innerHTML = `
          <div class="status-dot ${statusClass}"></div>
          <div class="status-text">${statusMessage}</div>
        `;
}

function setFileName(name) {
  const fileNameEl = document.getElementById('fileName');
  if (fileNameEl) {
    fileNameEl.textContent = name;
  }
  const fileInfo = document.getElementById('fileInfo');
  if (fileInfo) {
    fileInfo.classList.remove('hidden');
  }
  const uploadArea = document.getElementById('uploadArea');
  if (uploadArea) {
    uploadArea.classList.add('hidden');
  }
  isFileSelected = true;
  resetSummarySection();
  resetChatSection();
}

function requestSummaryGeneration() {
  if (!isFileSelected) {
    updateStatusIndicator('error', 'Please upload a document first');
    return;
  }
  console.log('Starting document summary generation');
  updateStatusIndicator('processing', 'Generating summary...');
  showGenerationProgress();
  fetch('/api/documents/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
    .then((response) => {
      console.log('Summary response status:', response.status);
      return response.json();
    })
    .then((data) => {
      console.log('Summary response data:', data);
      if (data.success) {
        displayDocumentSummary(data.summary);
        updateStatusIndicator('success', 'Summary generated');
        enableChatFeature();
        const errorElement = document.getElementById('chatError');
        if (errorElement) {
          errorElement.style.display = 'none';
        }
      } else {
        console.error('Summary generation failed:', data.error);
        updateStatusIndicator('error', data.error || 'Failed to generate summary');
      }
    })
    .catch((error) => {
      console.error('Summary request error:', error);
      updateStatusIndicator('error', 'Failed to generate summary: ' + error.message);
    })
    .finally(() => {
      hideGenerationProgress();
    });
}

function displayDocumentSummary(summary) {
  try {
    const htmlSummary = marked.parse(summary);
    const summaryText = document.getElementById('summaryText');
    if (summaryText) {
      summaryText.innerHTML = htmlSummary;
    }
    const summaryPlaceholder = document.getElementById('summaryPlaceholder');
    if (summaryPlaceholder) {
      summaryPlaceholder.classList.add('hidden');
    }
    const summaryContent = document.getElementById('summaryContent');
    if (summaryContent) {
      summaryContent.classList.remove('hidden');
    }
    isGeneratingSummary = false;
    updateStatusIndicator('success', 'Document analyzed successfully');
  } catch (error) {
    console.error('Error parsing markdown:', error);
    updateStatusIndicator('error', 'Error displaying summary');
  }
}

function enableChatFeature() {
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  const chatPlaceholder = document.getElementById('chatPlaceholder');
  if (chatPlaceholder) {
    chatPlaceholder.classList.add('hidden');
  }
  if (chatInput) {
    chatInput.disabled = false;
    chatInput.placeholder = 'Ask a question about the document...';
    chatInput.focus();
  }
  if (chatSendBtn) {
    chatSendBtn.disabled = false;
  }
  // Removed duplicate default message insertion.
}

function resetSummarySection() {
  const summaryText = document.getElementById('summaryText');
  if (summaryText) {
    summaryText.innerHTML = '';
  }
  const summaryPlaceholder = document.getElementById('summaryPlaceholder');
  if (summaryPlaceholder) {
    summaryPlaceholder.classList.remove('hidden');
  }
  const summaryContent = document.getElementById('summaryContent');
  if (summaryContent) {
    summaryContent.classList.add('hidden');
  }
  const generationProgress = document.getElementById('generationProgress');
  if (generationProgress) {
    generationProgress.classList.add('hidden');
  }
}

function resetChatSection() {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    while (chatMessages.firstChild) {
      chatMessages.removeChild(chatMessages.firstChild);
    }
    const chatPlaceholder = document.getElementById('chatPlaceholder');
    if (chatPlaceholder) {
      chatPlaceholder.classList.remove('hidden');
      chatMessages.appendChild(chatPlaceholder);
    }
  }
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatInput.disabled = true;
  }
  const chatSendBtn = document.getElementById('chatSendBtn');
  if (chatSendBtn) {
    chatSendBtn.disabled = true;
  }
  chatHistory = [];
}

function showGenerationProgress() {
  const generationProgress = document.getElementById('generationProgress');
  if (generationProgress) {
    generationProgress.classList.remove('hidden');
  }
  const summaryPlaceholder = document.getElementById('summaryPlaceholder');
  if (summaryPlaceholder) {
    summaryPlaceholder.classList.add('hidden');
  }
  const summaryContent = document.getElementById('summaryContent');
  if (summaryContent) {
    summaryContent.classList.remove('hidden');
  }
  updateProgressBar(0);
  updateProgressStage('Initializing document analysis...');
  const generateSummaryBtn = document.getElementById('generateSummaryBtn');
  if (generateSummaryBtn) {
    generateSummaryBtn.disabled = true;
  }
  simulateProgress();
}

function hideGenerationProgress() {
  const generationProgress = document.getElementById('generationProgress');
  if (generationProgress) {
    generationProgress.classList.add('hidden');
  }
  const generateSummaryBtn = document.getElementById('generateSummaryBtn');
  if (generateSummaryBtn) {
    generateSummaryBtn.disabled = false;
  }
  if (window.progressInterval) {
    clearInterval(window.progressInterval);
  }
}

function updateProgressBar(percent) {
  const progressBar = document.getElementById('progressBar');
  const progressPercent = document.getElementById('progressPercent');
  if (progressBar) {
    progressBar.style.width = percent + '%';
  }
  if (progressPercent) {
    progressPercent.textContent = Math.round(percent) + '%';
  }
}

function updateProgressStage(message) {
  const progressStage = document.getElementById('progressStage');
  if (progressStage) {
    progressStage.textContent = message;
  }
}

function simulateProgress() {
  const progressSteps = [
    { percent: 15, text: 'Extracting document content...' },
    { percent: 30, text: 'Analyzing document structure...' },
    { percent: 45, text: 'Identifying key concepts and topics...' },
    { percent: 60, text: 'Building knowledge graph from content...' },
    { percent: 75, text: 'Generating comprehensive summary...' },
    { percent: 90, text: 'Finalizing analysis and formatting...' },
  ];

  let currentStep = 0;
  if (window.progressInterval) {
    clearInterval(window.progressInterval);
  }
  window.progressInterval = setInterval(function () {
    if (currentStep < progressSteps.length) {
      const step = progressSteps[currentStep];
      updateProgressBar(step.percent);
      updateProgressStage(step.text);
      currentStep++;
    } else {
      let width =
        parseFloat(document.getElementById('progressBar').style.width) || 90;
      if (width < 95) {
        width += 0.2;
        updateProgressBar(width);
      }
    }
  }, 800);
}

function addChatMessage(content, role) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('animate-slide-up', 'max-w-[90%]', 'mb-4');
  let messageContent;
  switch (role) {
    case 'user':
      messageDiv.classList.add('ml-auto');
      messageContent = `
                    <div class="chat-bubble bg-primary-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 inline-block shadow-sm">
                        ${content}
                    </div>`;
      break;
    case 'assistant':
      messageDiv.classList.add('mr-auto');
      messageContent = `
                    <div class="chat-bubble bg-neutral-100 rounded-2xl rounded-tl-sm px-4 py-3 markdown text-neutral-800 shadow-sm">
                        ${marked.parse(content)}
                    </div>`;
      break;
    case 'assistant-error':
      messageDiv.classList.add('mr-auto');
      messageContent = `
                    <div class="chat-bubble bg-red-50 rounded-2xl rounded-tl-sm px-4 py-3 text-red-600 shadow-sm">
                        ${content}
                    </div>`;
      break;
    case 'thinking':
      messageDiv.classList.add('mr-auto');
      messageContent = `
                    <div class="bg-neutral-100 rounded-2xl rounded-tl-sm px-4 py-3 text-neutral-600 shadow-sm">
                        <div class="typing-indicator flex items-center space-x-1">
                            <span>Thinking</span>
                            <span>•</span>
                            <span>•</span>
                            <span>•</span>
                        </div>
                    </div>`;
      break;
  }
  messageDiv.innerHTML = messageContent;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return messageDiv;
}

function sendChatMessage() {
  const chatInput = document.getElementById('chatInput');
  if (!chatInput) return;
  const question = chatInput.value.trim();
  if (!question) return;
  addChatMessage(question, 'user');
  chatInput.value = '';
  chatInput.style.height = 'auto';
  chatInput.disabled = true;
  const chatSendBtn = document.getElementById('chatSendBtn');
  if (chatSendBtn) {
    chatSendBtn.disabled = true;
  }
  const thinkingMessage = addChatMessage('', 'thinking');
  updateStatusIndicator('processing', 'Processing question...');
  fetch('/api/documents/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question: question,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (thinkingMessage) {
        thinkingMessage.remove();
      }
      if (data.success && data.answer) {
        displayChatResponse(data.answer);
        updateStatusIndicator('success', 'Response generated');
      } else {
        const errorMessage =
          data.error || 'An error occurred while generating the response';
        displayChatResponse(errorMessage, true);
        updateStatusIndicator('error', 'Error generating response');
      }
    })
    .catch((error) => {
      console.error('Error:', error);
      if (thinkingMessage) {
        thinkingMessage.remove();
      }
      displayChatResponse('An error occurred while processing your request', true);
      updateStatusIndicator('error', 'Error generating response');
    })
    .finally(() => {
      chatInput.disabled = false;
      chatInput.focus();
      if (chatSendBtn) {
        chatSendBtn.disabled = false;
      }
    });
}

function displayChatResponse(response, isError = false) {
  const thinkingMessages = document.querySelectorAll('.typing-indicator');
  thinkingMessages.forEach((msg) => {
    const parentMessage = msg.closest('.animate-slide-up');
    if (parentMessage) {
      parentMessage.remove();
    }
  });
  if (isError) {
    addChatMessage(`Error: ${response}`, 'assistant-error');
  } else {
    addChatMessage(response, 'assistant');
  }
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.disabled = false;
    chatInput.focus();
  }
  const chatSendBtn = document.getElementById('chatSendBtn');
  if (chatSendBtn) {
    chatSendBtn.disabled = false;
  }
}

function fetchEmail() {
  alert('Email fetch functionality would be implemented here');
}

function uploadImage() {
  alert('Image upload functionality would be implemented here');
}
