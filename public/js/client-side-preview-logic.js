// Client-side preview logic
document.addEventListener('DOMContentLoaded', () => {
  const previewText = document.getElementById('preview-text');
  const playBtn = document.getElementById('preview-play');
  const stopBtn = document.getElementById('preview-stop');
  const previewVoiceSelect = document.getElementById('preview-browser-voice');
  const formVoiceSelect = document.getElementById('voice-select');
  const speedRadios = document.getElementsByName('speed');
  const form = document.getElementById('pdf-to-audio-form');

  if (!('speechSynthesis' in window)) {
    previewVoiceSelect.innerHTML = '<option value="">Speech synthesis not supported</option>';
    playBtn.disabled = true;
    stopBtn.disabled = true;
    return;
  }

  // Populate available voices
  function populateVoices() {
    const voices = speechSynthesis.getVoices();
    const enVoices = voices.filter(v => /en(-|_)?/i.test(v.lang));
    const list = enVoices.length ? enVoices : voices;

    previewVoiceSelect.innerHTML = '';
    list.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      previewVoiceSelect.appendChild(opt);
    });

    if (previewVoiceSelect.options.length === 0) {
      previewVoiceSelect.innerHTML = '<option value="">No voices found</option>';
    }
  }

  populateVoices();
  if (typeof speechSynthesis.onvoiceschanged !== 'undefined') {
    speechSynthesis.onvoiceschanged = populateVoices;
  }

  function getSelectedSpeedRate() {
    const checked = Array.from(speedRadios).find(r => r.checked);
    return checked ? parseFloat(checked.value) : 1.0;
  }

  function findBrowserVoiceMatchingFormChoice() {
    const formValue = formVoiceSelect.value || '';
    let locale = 'en-US'; // default

    switch (formValue) {
      case 'uk': locale = 'en-GB'; break;
      case 'au': locale = 'en-AU'; break;
      case 'ca': locale = 'en-CA'; break;
      case 'us': locale = 'en-US'; break;
    }

    const voices = speechSynthesis.getVoices();
    let voice = voices.find(v => v.lang && v.lang.includes(locale));

    if (!voice) {
      voice = voices.find(v => v.lang && /en(-|_)?/i.test(v.lang));
    }
    if (!voice && voices.length > 0) {
      voice = voices[0];
    }
    return voice;
  }

  playBtn.addEventListener('click', () => {
    window.speechSynthesis.cancel();
    const text = previewText.value.trim();
    if (!text) return;

    const utter = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const selectedBrowserVoiceName = previewVoiceSelect.value;
    const browserVoice = voices.find(v => v.name === selectedBrowserVoiceName) || findBrowserVoiceMatchingFormChoice();

    if (browserVoice) utter.voice = browserVoice;
    utter.rate = getSelectedSpeedRate();
    window.speechSynthesis.speak(utter);
  });

  stopBtn.addEventListener('click', () => {
    window.speechSynthesis.cancel();
  });

  // Sync preview voice with form voice choice
  formVoiceSelect.addEventListener('change', () => {
    const matchingVoice = findBrowserVoiceMatchingFormChoice();
    if (matchingVoice) {
      previewVoiceSelect.value = matchingVoice.name;
    }
  });

  // Ensure the form always submits valid values
  form.addEventListener('submit', () => {
    if (!Array.from(speedRadios).some(r => r.checked)) {
      const normal = document.getElementById('speed-normal');
      if (normal) normal.checked = true;
    }
  });
});
