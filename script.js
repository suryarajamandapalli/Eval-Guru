// ========== DOM Elements ==========
const subjectSel = document.getElementById("subjectSelect");
const pyqSel = document.getElementById("pyqSelect");
const paperSec = document.getElementById("paperSection");
const pdfViewer = document.getElementById("pdfViewer");
const uploadSec = document.getElementById("uploadSection");
const fileInp = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const submitBtn = document.getElementById("submitAnswersBtn");
const evalBox = document.getElementById("evaluationResult");
const aiOut = document.getElementById("aiFeedback");
const randomBtn = document.getElementById("randomBtn");
const startBtn = document.getElementById("startExamBtn");
const timerDisp = document.getElementById("timerDisplay");

// ========== Config ==========
const OPENROUTER_KEY = "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";
const TIMER_SECONDS = 5; // Adjust time as needed
let countdownInterval = null;

const PYQS = {
  devc: ["devc-1.pdf", "devc-2.pdf", "devc-3.pdf"],
  physics: ["physics-1.pdf", "physics-2.pdf", "physics-nov23.pdf"],
  ds: ["ds-1.pdf", "ds-2.pdf", "ds-nov23.pdf"],
  beee: ["beee-1.pdf", "beee-2.pdf", "beee-nov23.pdf"]
};

// ========== Prompt Builder ==========
function makePrompt(subject, text) {
  const subjectInstructions = {
    devc: `📘 DEVC (Mathematics-II: Differential Equations & Vector Calculus)\n- Check math steps, formulas, final answer.`,
    physics: `📘 Engineering Physics\n- Check logic, diagrams, derivations, units.`,
    ds: `📘 Data Structures\n- Evaluate logic, code correctness, outputs.`,
    beee: `📘 BEEE\n- Check circuit diagrams, formulas, laws, numericals.`
  };

  return `
🧑‍🏫 You are a strict JNTUK R23 evaluator.

🧾 Instructions:
- Max Marks: 70
- 10 Questions × 7 Marks
- Each question has a/b choice; evaluate only what's written.
- 0 for irrelevant, wrong or blank answers.
- Give scores like:
  Q1: 6/7 - Missing units  
  Q2: 0/7 - Irrelevant
...
- TOTAL = __ / 70

${subjectInstructions[subject] || ""}
----------------------------
${text}
----------------------------`.trim();
}

// ========== Subject → PYQ Dropdown ==========
subjectSel.addEventListener("change", () => {
  const subj = subjectSel.value;
  pyqSel.innerHTML = `<option disabled selected>-- Choose Paper --</option>`;
  paperSec.style.display = PYQS[subj] ? "block" : "none";

  if (PYQS[subj]) {
    PYQS[subj].forEach(pdf => {
      const opt = document.createElement("option");
      opt.value = pdf;
      opt.textContent = pdf;
      pyqSel.appendChild(opt);
    });
  }

  resetAll();
});

// ========== PYQ Selection ==========
pyqSel.addEventListener("change", () => {
  const selectedPdf = pyqSel.value;
  if (selectedPdf) {
    pdfViewer.src = `pyqs/${selectedPdf}`;
    pdfViewer.style.display = "block";
    resetTimerAndUpload();
  }
});

// ========== Random PYQ ==========
randomBtn.addEventListener("click", () => {
  const subj = subjectSel.value;
  if (!subj || !PYQS[subj]) return alert("Select a subject first!");

  const randomPdf = PYQS[subj][Math.floor(Math.random() * PYQS[subj].length)];
  pyqSel.innerHTML = `<option selected value="${randomPdf}">${randomPdf}</option>`;
  paperSec.style.display = "block";
  pdfViewer.src = `pyqs/${randomPdf}`;
  pdfViewer.style.display = "block";
  resetTimerAndUpload();
});

// ========== Start Exam ==========
startBtn.addEventListener("click", () => {
  const pdf = pyqSel.value;
  if (!pdf) return alert("Pick a PYQ first!");

  pdfViewer.src = `pyqs/${pdf}`;
  pdfViewer.style.display = "block";
  resetTimerAndUpload();
  runTimer(TIMER_SECONDS);
});


// ========== Timer ==========
function runTimer(duration) {
  clearInterval(countdownInterval);
  let remaining = duration;

  countdownInterval = setInterval(() => {
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    timerDisp.textContent = `⏳ Time Left: ${hours}h ${minutes}m ${seconds}s`;

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      timerDisp.textContent = "✅ Time's up! Upload your answers.";

      // ❌ Don't hide the PDF after timer ends
      // pdfViewer.style.display = "none"; ← Removed this line

      uploadSec.style.display = "block";
      submitBtn.style.display = "block";
    }

    remaining--;
  }, 1000);
}


// ========== File Upload ==========
fileInp.addEventListener("change", () => {
  const files = Array.from(fileInp.files);
  fileList.innerHTML = "";

  if (files.length > 34) {
    alert("You can only upload up to 34 files.");
    fileInp.value = "";
    return;
  }

  files.forEach(file => {
    const li = document.createElement("li");
    li.textContent = file.name;
    fileList.appendChild(li);
  });

  submitBtn.style.display = "block";
});

// ========== AI Evaluation ==========
submitBtn.addEventListener("click", async () => {
  if (!fileInp.files.length) return alert("Upload answer sheets first.");
  evalBox.style.display = "block";
  aiOut.value = "⏳ OCR in progress...";

  try {
    const texts = [];
    for (const file of fileInp.files) {
      const dataURL = await readAsDataURL(file);
      const rawText = await Tesseract.recognize(dataURL, "eng").then(r => r.data.text);

      const cleanText = rawText
        .replace(/\\textbf|\\\(.*?\\\)|\\[a-z]+\s*/g, '')
        .split("\n")
        .filter(line => {
          return !/^(Q[0-9]+[:.])|(Find|Define|Explain|Derive|What|How)/i.test(line.trim()) && line.trim().length > 3;
        })
        .join("\n");

      texts.push(`File: ${file.name}\n${cleanText}`);
    }

    const answers = texts.join("\n\n---\n\n").trim();
    if (!answers) {
      aiOut.value = "⚠️ OCR found no readable student answers.";
      return;
    }

    aiOut.value = "🧠 Waiting for AI response...";
    const prompt = makePrompt(subjectSel.value, answers);

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a strict JNTUK R23 evaluator." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2
      })
    });

    const data = await res.json();
    aiOut.value = data?.choices?.[0]?.message?.content?.trim() || "⚠️ AI did not return a valid response.";
  } catch (err) {
    console.error(err);
    aiOut.value = "❌ Error during evaluation: " + err.message;
  }
});

// ========== Utilities ==========
function resetTimerAndUpload() {
  clearInterval(countdownInterval);
  timerDisp.textContent = "";
  uploadSec.style.display = "none";
  evalBox.style.display = "none";
  submitBtn.style.display = "none";
  fileInp.value = "";
  fileList.innerHTML = "";
  aiOut.value = "";
}

function resetAll() {
  pdfViewer.style.display = "none";
  pyqSel.innerHTML = "";
  paperSec.style.display = "none";
  resetTimerAndUpload();
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
