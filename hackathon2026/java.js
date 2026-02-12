(function () {
  "use strict";

  // --- State ---------------------------------------------------

  const STATE = {
    auth: {
      fingerprint: false,
      face: false,
    },
    candidates: {
      aurora: 420, // start with some base data to show meaningful percentages
      orion: 360,
      lyra: 220,
    },
    user: {
      hasVoted: false,
      selectedCandidate: null,
    },
  };

  const LS_KEYS = {
    THEME: "nova-theme",
    FINGERPRINT: "nova-fingerprint-verified",
    FACE: "nova-face-verified",
    VOTED: "nova-voted",
    CHOICE: "nova-choice",
  };

  // --- DOM refs ------------------------------------------------

  const body = document.documentElement;
  const themeToggle = document.getElementById("themeToggle");

  const fingerBtn = document.getElementById("fingerBtn");
  const faceBtn = document.getElementById("faceBtn");
  const fingerStatus = document.getElementById("fingerStatus");
  const faceStatus = document.getElementById("faceStatus");
  const authChip = document.getElementById("authChip");

  const cameraShell = document.getElementById("cameraShell");
  const cameraStreamEl = document.getElementById("cameraStream");

  const candidateGrid = document.getElementById("candidateGrid");
  const voteStatus = document.getElementById("voteStatus");

  const turnoutValue = document.getElementById("turnoutValue");
  const turnoutBar = document.getElementById("turnoutBar");
  const latencyValue = document.getElementById("latencyValue");
  const latencyBar = document.getElementById("latencyBar");

  const resultsBars = document.getElementById("resultsBars");
  const activityFeed = document.getElementById("activityFeed");

  const confirmModal = document.getElementById("confirmModal");
  const confirmVoteBtn = document.getElementById("confirmVote");
  const cancelVoteBtn = document.getElementById("cancelVote");

  // --- Utils ---------------------------------------------------

  function saveLocalState() {
    localStorage.setItem(
      LS_KEYS.FINGERPRINT,
      STATE.auth.fingerprint ? "1" : "0"
    );
    localStorage.setItem(LS_KEYS.FACE, STATE.auth.face ? "1" : "0");
    localStorage.setItem(LS_KEYS.VOTED, STATE.user.hasVoted ? "1" : "0");
    if (STATE.user.selectedCandidate) {
      localStorage.setItem(LS_KEYS.CHOICE, STATE.user.selectedCandidate);
    }
  }

  function restoreLocalState() {
    const theme = localStorage.getItem(LS_KEYS.THEME);
    if (theme === "light" || theme === "dark") {
      body.setAttribute("data-theme", theme);
    }

    STATE.auth.fingerprint = localStorage.getItem(LS_KEYS.FINGERPRINT) === "1";
    STATE.auth.face = localStorage.getItem(LS_KEYS.FACE) === "1";
    STATE.user.hasVoted = localStorage.getItem(LS_KEYS.VOTED) === "1";
    const storedChoice = localStorage.getItem(LS_KEYS.CHOICE);
    if (storedChoice && STATE.candidates.hasOwnProperty(storedChoice)) {
      STATE.user.selectedCandidate = storedChoice;
    }
  }

  function isBiometricallyVerified() {
    return STATE.auth.fingerprint || STATE.auth.face;
  }

  function fmtPercent(value) {
    return value.toFixed(1) + "%";
  }

  function addActivity(label, meta) {
    const row = document.createElement("div");
    row.className = "activity-item";
    const tag = document.createElement("span");
    tag.className = "activity-tag";
    tag.textContent = label;
    const detail = document.createElement("span");
    detail.className = "activity-meta";
    detail.textContent = meta;
    row.appendChild(tag);
    row.appendChild(detail);
    activityFeed.prepend(row);

    // limit number of log lines
    const maxItems = 9;
    while (activityFeed.children.length > maxItems) {
      activityFeed.removeChild(activityFeed.lastChild);
    }
  }

  // --- Theme ---------------------------------------------------

  function toggleTheme() {
    const current = body.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    body.setAttribute("data-theme", next);
    localStorage.setItem(LS_KEYS.THEME, next);
  }

  themeToggle.addEventListener("click", toggleTheme);

  // --- Auth UI -------------------------------------------------

  function renderAuth() {
    // Fingerprint
    if (STATE.auth.fingerprint) {
      fingerBtn.classList.add("disabled");
      fingerStatus.textContent = "Verified";
    } else {
      fingerBtn.classList.remove("disabled");
      fingerStatus.textContent = "Ready";
    }

    // Face
    if (STATE.auth.face) {
      faceBtn.classList.add("disabled");
      faceStatus.textContent = "Verified";
    } else {
      faceBtn.classList.remove("disabled");
      faceStatus.textContent = "Ready";
    }

    // Chip
    if (isBiometricallyVerified()) {
      authChip.textContent = "Unlocked · biometrics OK";
      authChip.style.color = "var(--accent-third)";
    } else {
      authChip.textContent = "Locked · verify to vote";
      authChip.style.color = "var(--text-soft)";
    }
  }

  function simulateFingerprintScan() {
    if (STATE.auth.fingerprint) return;

    fingerStatus.textContent = "Scanning…";
    fingerBtn.classList.add("scanning");
    addActivity("SCAN", "Fingerprint pattern requested");

    setTimeout(() => {
      fingerBtn.classList.remove("scanning");
      STATE.auth.fingerprint = true;
      fingerStatus.textContent = "Verified";
      addActivity("ACCESS", "Fingerprint accepted");
      renderAuth();
      saveLocalState();
    }, 1300);
  }

  async function simulateFaceScan() {
    if (STATE.auth.face) return;

    faceStatus.textContent = "Scanning…";
    addActivity("SCAN", "Face recognition requested");

    // Try real camera if available, else fallback to fake delay
    if (
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      !STATE._cameraActive
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        STATE._cameraActive = true;
        cameraShell.classList.remove("hidden");
        cameraStreamEl.srcObject = stream;

        setTimeout(() => {
          stream.getTracks().forEach((t) => t.stop());
          STATE._cameraActive = false;
          cameraShell.classList.add("hidden");
          completeFaceScan();
        }, 2200);
      } catch (err) {
        // fallback
        console.warn("Camera not available", err);
        setTimeout(completeFaceScan, 1500);
      }
    } else {
      setTimeout(completeFaceScan, 1500);
    }
  }

  function completeFaceScan() {
    STATE.auth.face = true;
    faceStatus.textContent = "Verified";
    addActivity("ACCESS", "Face ID accepted");
    renderAuth();
    saveLocalState();
  }

  fingerBtn.addEventListener("click", () => {
    if (STATE.auth.fingerprint) return;
    simulateFingerprintScan();
  });

  faceBtn.addEventListener("click", () => {
    if (STATE.auth.face) return;
    simulateFaceScan();
  });

  // --- Voting --------------------------------------------------

  let pendingVoteCandidate = null;

  function renderBallotSelection() {
    const cards = candidateGrid.querySelectorAll(".candidate-card");
    cards.forEach((card) => {
      const id = card.getAttribute("data-id");
      if (STATE.user.selectedCandidate === id) {
        card.classList.add("selected");
      } else {
        card.classList.remove("selected");
      }
    });

    if (STATE.user.hasVoted) {
      voteStatus.textContent =
        "Ballot locked on this device · " + STATE.user.selectedCandidate;
    } else if (!isBiometricallyVerified()) {
      voteStatus.textContent = "Secure channel idle";
    } else if (STATE.user.selectedCandidate) {
      voteStatus.textContent =
        "Ready to confirm · " + STATE.user.selectedCandidate;
    } else {
      voteStatus.textContent = "Secure channel ready";
    }

    const voteButtons = candidateGrid.querySelectorAll(".vote-btn");
    voteButtons.forEach((btn) => {
      btn.disabled = STATE.user.hasVoted || !isBiometricallyVerified();
    });
  }

  function openConfirmModal(candidateId) {
    pendingVoteCandidate = candidateId;
    confirmModal.classList.remove("hidden");
  }

  function closeConfirmModal() {
    pendingVoteCandidate = null;
    confirmModal.classList.add("hidden");
  }

  candidateGrid.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".vote-btn");
    if (!btn) return;
    const candidateId = btn.getAttribute("data-id");

    if (!isBiometricallyVerified()) {
      voteStatus.textContent = "Need biometric unlock first";
      addActivity("DENY", "Vote blocked – no biometrics");
      return;
    }

    if (STATE.user.hasVoted) {
      voteStatus.textContent = "Vote already locked";
      return;
    }

    STATE.user.selectedCandidate = candidateId;
    renderBallotSelection();
    openConfirmModal(candidateId);
  });

  confirmVoteBtn.addEventListener("click", () => {
    if (!pendingVoteCandidate || STATE.user.hasVoted) {
      closeConfirmModal();
      return;
    }

    const id = pendingVoteCandidate;
    STATE.candidates[id] += 1;
    STATE.user.hasVoted = true;

    addActivity("CAST", "Vote stored for " + id);
    voteStatus.textContent = "Ballot locked · " + id;

    saveLocalState();
    renderBallotSelection();
    updateResultsUI();

    closeConfirmModal();
  });

  cancelVoteBtn.addEventListener("click", () => {
    closeConfirmModal();
    voteStatus.textContent = "Secure channel ready";
  });

  confirmModal.addEventListener("click", (ev) => {
    if (ev.target === confirmModal) {
      closeConfirmModal();
    }
  });

  // --- Results + “real-time” updates ---------------------------

  function getTotalVotes() {
    return (
      STATE.candidates.aurora +
      STATE.candidates.orion +
      STATE.candidates.lyra
    );
  }

  function updateResultsUI() {
    const total = getTotalVotes() || 1;

    ["aurora", "orion", "lyra"].forEach((id) => {
      const share = (STATE.candidates[id] / total) * 100;
      const row = resultsBars.querySelector(`.result-row[data-id="${id}"]`);
      const fill = row.querySelector(".result-fill");
      const valueLabel = row.querySelector('.result-value[data-score="' + id + '"]');
      const cardScore = document.querySelector(
        '.candidate-score[data-score="' + id + '"]'
      );

      fill.style.width = share.toFixed(1) + "%";
      valueLabel.textContent = share.toFixed(1) + "%";
      if (cardScore) {
        cardScore.textContent = share.toFixed(1) + "%";
      }
    });

    // Turnout (fake scale vs. an arbitrary cap)
    const turnoutPercent = Math.min(getTotalVotes() / 14, 1) * 100;
    turnoutValue.textContent = fmtPercent(turnoutPercent);
    turnoutBar.style.width = turnoutPercent.toFixed(1) + "%";
  }

  // Simulated network latency metric & background vote noise
  function startTelemetricLoop() {
    setInterval(() => {
      const jitter = Math.round(6 + Math.random() * 12);
      latencyValue.textContent = jitter + " ms";
      const width = Math.min(100, (jitter / 18) * 60 + 20);
      latencyBar.style.width = width + "%";

      // subtle global noise – random live votes
      if (Math.random() < 0.45) {
        const pool = ["aurora", "orion", "lyra"];
        const id = pool[Math.floor(Math.random() * pool.length)];
        STATE.candidates[id] += 1;
        updateResultsUI();
        addActivity("LIVE", "New packet · " + id);
      }
    }, 2400);
  }

  // --- Init ----------------------------------------------------

  function init() {
    restoreLocalState();
    renderAuth();
    renderBallotSelection();
    updateResultsUI();
    startTelemetricLoop();

    if (STATE.user.hasVoted && STATE.user.selectedCandidate) {
      addActivity("SYNC", "Existing ballot · " + STATE.user.selectedCandidate);
    } else {
      addActivity("BOOT", "Interface online");
    }
  }

  init();
})();