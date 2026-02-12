(function () {
  "use strict";

  const CANDIDATE_IDS = ["aurora", "orion", "lyra", "nova"];

  const STATE = {
    auth: {
      fingerprint: false,
      face: false,
    },
    candidates: {
      aurora: 420,
      orion: 360,
      lyra: 220,
      nova: 180,
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

  const body = document.documentElement;
  const themeToggle = document.getElementById("themeToggle");
  const fingerBtn = document.getElementById("fingerBtn");
  const faceBtn = document.getElementById("faceBtn");
  const fingerStatus = document.getElementById("fingerStatus");
  const faceStatus = document.getElementById("faceStatus");
  const authChip = document.getElementById("authChip");
  const cameraShell = document.getElementById("cameraShell");
  const cameraStreamEl = document.getElementById("cameraStream");
  const candidateSearch = document.getElementById("candidateSearch");
  const candidateGrid = document.getElementById("candidateGrid");
  const searchEmpty = document.getElementById("searchEmpty");
  const searchEmptyQuery = document.getElementById("searchEmptyQuery");
  const voteStatus = document.getElementById("voteStatus");
  const votesSecured = document.getElementById("votesSecured");
  const turnoutValue = document.getElementById("turnoutValue");
  const turnoutBar = document.getElementById("turnoutBar");
  const latencyValue = document.getElementById("latencyValue");
  const latencyBar = document.getElementById("latencyBar");
  const resultsBars = document.getElementById("resultsBars");
  const activityFeed = document.getElementById("activityFeed");
  const confirmModal = document.getElementById("confirmModal");
  const confirmVoteBtn = document.getElementById("confirmVote");
  const cancelVoteBtn = document.getElementById("cancelVote");

  function saveLocalState() {
    localStorage.setItem(LS_KEYS.FINGERPRINT, STATE.auth.fingerprint ? "1" : "0");
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
    while (activityFeed.children.length > 10) {
      activityFeed.removeChild(activityFeed.lastChild);
    }
  }

  // ----- Theme -----
  function toggleTheme() {
    const current = body.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    body.setAttribute("data-theme", next);
    localStorage.setItem(LS_KEYS.THEME, next);
  }
  themeToggle.addEventListener("click", toggleTheme);

  // ----- Search -----
  let searchDebounce = null;
  function runSearch() {
    const q = (candidateSearch.value || "").trim().toLowerCase();
    const cards = candidateGrid.querySelectorAll(".candidate-card");
    let visibleCount = 0;
    cards.forEach(function (card) {
      const name = (card.getAttribute("data-name") || "").toLowerCase();
      const tags = (card.getAttribute("data-tags") || "").toLowerCase();
      const id = (card.getAttribute("data-id") || "").toLowerCase();
      const match = !q || name.includes(q) || tags.includes(q) || id.includes(q);
      if (match) {
        card.classList.remove("hidden-by-search");
        card.classList.add("visible-by-search");
        visibleCount++;
      } else {
        card.classList.add("hidden-by-search");
        card.classList.remove("visible-by-search");
      }
    });
    if (q && visibleCount === 0) {
      searchEmpty.classList.remove("hidden");
      searchEmptyQuery.textContent = q;
    } else {
      searchEmpty.classList.add("hidden");
    }
  }

  candidateSearch.addEventListener("input", function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(runSearch, 180);
  });
  candidateSearch.addEventListener("search", runSearch);

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== candidateSearch && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      candidateSearch.focus();
    }
    if (e.key === "Escape") {
      candidateSearch.blur();
      candidateSearch.value = "";
      runSearch();
    }
  });

  // ----- Auth UI -----
  function renderAuth() {
    if (STATE.auth.fingerprint) {
      fingerBtn.classList.add("disabled");
      fingerStatus.textContent = "Verified";
    } else {
      fingerBtn.classList.remove("disabled");
      fingerStatus.textContent = "Ready";
    }
    if (STATE.auth.face) {
      faceBtn.classList.add("disabled");
      faceStatus.textContent = "Verified";
    } else {
      faceBtn.classList.remove("disabled");
      faceStatus.textContent = "Ready";
    }
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
    addActivity("SCAN", "Fingerprint requested");
    setTimeout(function () {
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
    addActivity("SCAN", "Face recognition");
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !STATE._cameraActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        STATE._cameraActive = true;
        cameraShell.classList.remove("hidden");
        cameraStreamEl.srcObject = stream;
        setTimeout(function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          STATE._cameraActive = false;
          cameraShell.classList.add("hidden");
          completeFaceScan();
        }, 2200);
      } catch (err) {
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

  fingerBtn.addEventListener("click", function () {
    if (!STATE.auth.fingerprint) simulateFingerprintScan();
  });
  faceBtn.addEventListener("click", function () {
    if (!STATE.auth.face) simulateFaceScan();
  });

  // ----- Voting -----
  let pendingVoteCandidate = null;

  function renderBallotSelection() {
    const cards = candidateGrid.querySelectorAll(".candidate-card");
    cards.forEach(function (card) {
      const id = card.getAttribute("data-id");
      if (STATE.user.selectedCandidate === id) {
        card.classList.add("selected");
      } else {
        card.classList.remove("selected");
      }
    });
    if (STATE.user.hasVoted) {
      voteStatus.textContent = "Ballot locked · " + (STATE.user.selectedCandidate || "");
    } else if (!isBiometricallyVerified()) {
      voteStatus.textContent = "Secure channel idle";
    } else if (STATE.user.selectedCandidate) {
      voteStatus.textContent = "Ready to confirm · " + STATE.user.selectedCandidate;
    } else {
      voteStatus.textContent = "Secure channel ready";
    }
    const voteButtons = candidateGrid.querySelectorAll(".vote-btn");
    voteButtons.forEach(function (btn) {
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

  candidateGrid.addEventListener("click", function (ev) {
    const btn = ev.target.closest(".vote-btn");
    if (!btn) return;
    const candidateId = btn.getAttribute("data-id");
    if (!isBiometricallyVerified()) {
      voteStatus.textContent = "Need biometric unlock";
      addActivity("DENY", "No biometrics");
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

  confirmVoteBtn.addEventListener("click", function () {
    if (!pendingVoteCandidate || STATE.user.hasVoted) {
      closeConfirmModal();
      return;
    }
    const id = pendingVoteCandidate;
    if (STATE.candidates.hasOwnProperty(id)) {
      STATE.candidates[id] += 1;
    }
    STATE.user.hasVoted = true;
    addActivity("CAST", "Vote · " + id);
    voteStatus.textContent = "Ballot locked · " + id;
    saveLocalState();
    renderBallotSelection();
    updateResultsUI();
    updateVotesSecured();
    closeConfirmModal();
  });

  cancelVoteBtn.addEventListener("click", closeConfirmModal);
  confirmModal.addEventListener("click", function (ev) {
    if (ev.target === confirmModal) closeConfirmModal();
  });

  // ----- Results -----
  function getTotalVotes() {
    return CANDIDATE_IDS.reduce(function (sum, id) {
      return sum + (STATE.candidates[id] || 0);
    }, 0);
  }

  function updateVotesSecured() {
    var total = getTotalVotes();
    votesSecured.textContent = total + " secured";
  }

  function updateResultsUI() {
    var total = getTotalVotes() || 1;
    CANDIDATE_IDS.forEach(function (id) {
      var share = ((STATE.candidates[id] || 0) / total) * 100;
      var row = resultsBars.querySelector('.result-row[data-id="' + id + '"]');
      if (!row) return;
      var fill = row.querySelector(".result-fill");
      var valueLabel = row.querySelector('.result-value[data-score="' + id + '"]');
      var cardScore = document.querySelector('.candidate-score[data-score="' + id + '"]');
      if (fill) fill.style.width = share.toFixed(1) + "%";
      if (valueLabel) valueLabel.textContent = share.toFixed(1) + "%";
      if (cardScore) cardScore.textContent = share.toFixed(1) + "%";
    });
    var turnoutPercent = Math.min(getTotalVotes() / 18, 1) * 100;
    if (turnoutValue) turnoutValue.textContent = fmtPercent(turnoutPercent);
    if (turnoutBar) turnoutBar.style.width = turnoutPercent.toFixed(1) + "%";
    updateVotesSecured();
  }

  function startTelemetricLoop() {
    setInterval(function () {
      var jitter = Math.round(6 + Math.random() * 12);
      if (latencyValue) latencyValue.textContent = jitter + " ms";
      var width = Math.min(100, (jitter / 18) * 60 + 20);
      if (latencyBar) latencyBar.style.width = width + "%";
      if (Math.random() < 0.4) {
        var id = CANDIDATE_IDS[Math.floor(Math.random() * CANDIDATE_IDS.length)];
        STATE.candidates[id] = (STATE.candidates[id] || 0) + 1;
        updateResultsUI();
        addActivity("LIVE", "Packet · " + id);
      }
    }, 2400);
  }

  // ----- Init -----
  function init() {
    restoreLocalState();
    renderAuth();
    renderBallotSelection();
    updateResultsUI();
    runSearch();
    startTelemetricLoop();
    if (STATE.user.hasVoted && STATE.user.selectedCandidate) {
      addActivity("SYNC", "Ballot · " + STATE.user.selectedCandidate);
    } else {
      addActivity("BOOT", "Interface online");
    }
  }

  init();
})();
