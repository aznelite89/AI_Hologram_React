import { experimental_generateSpeech as generateSpeech } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { openAIAPiKey } from "./apikey.js";

const openai = createOpenAI({
  apiKey: openAIAPiKey,
});

const createAudio = async (text) => {
  // return "/ElevenLabs_Text_to_Speech_audio.mp3";
  const audio = await generateSpeech({
    model: openai.speech("tts-1"),
    text: text,
    voice: "alloy",
    providerOptions: {
      openai: {
        response_format: "mp3",
      },
    },
  });
  const audioData = audio.audio;
  const arrayBuffer = audioData.uint8ArrayData;
  const audioBlob = new Blob([arrayBuffer], { type: audioData.mediaType });
  // console.log({ audio, arrayBuffer });

  // const audioData = audio.audioData; // audio data e.g. Uint8Array
  // const audioBlob = new Blob([audioData], { type: "audio/mp3" });
  return URL.createObjectURL(audioBlob);
  // //download the audio
  const link = document.createElement("a");
  link.href = audioUrl;
  link.download = audioData.mediaType;
  link.click();
  // audioElement.play();
  return audioUrl;
};

function average(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
const VISEMES = {
  sil: "viseme_sil",
  PP: "viseme_PP",
  FF: "viseme_FF",
  TH: "viseme_TH",
  DD: "viseme_DD",
  kk: "viseme_kk",
  CH: "viseme_CH",
  SS: "viseme_SS",
  nn: "viseme_nn",
  RR: "viseme_RR",
  aa: "viseme_aa",
  E: "viseme_E",
  I: "viseme_I",
  O: "viseme_O",
  U: "viseme_U",
};
const FSMStates = {
  silence: "silence",
  vowel: "vowel",
  plosive: "plosive",
  fricative: "fricative",
};
const VISEMES_STATES = {
  [VISEMES.sil]: FSMStates.silence,
  [VISEMES.PP]: FSMStates.plosive,
  [VISEMES.FF]: FSMStates.fricative,
  [VISEMES.TH]: FSMStates.fricative,
  [VISEMES.DD]: FSMStates.plosive,
  [VISEMES.kk]: FSMStates.plosive,
  [VISEMES.CH]: FSMStates.fricative,
  [VISEMES.SS]: FSMStates.fricative,
  [VISEMES.nn]: FSMStates.plosive,
  [VISEMES.RR]: FSMStates.fricative,
  [VISEMES.aa]: FSMStates.vowel,
  [VISEMES.E]: FSMStates.vowel,
  [VISEMES.I]: FSMStates.vowel,
  [VISEMES.O]: FSMStates.vowel,
  [VISEMES.U]: FSMStates.vowel,
};
class Lipsync {
  constructor(
    params = {
      fftSize: 2048,
      historySize: 10,
    }
  ) {
    this.features = null;
    this.viseme = VISEMES.sil;
    this.state = FSMStates.silence;
    const { fftSize = 2048, historySize = 10 } = params;
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.history = [];
    this.historySize = historySize;
    this.sampleRate = this.audioContext.sampleRate;
    this.binWidth = this.sampleRate / fftSize;
    this.bands = [
      {
        start: 50,
        end: 200,
      },
      {
        start: 200,
        end: 400,
      },
      {
        start: 400,
        end: 800,
      },
      {
        start: 800,
        end: 1500,
      },
      {
        start: 1500,
        end: 2500,
      },
      {
        start: 2500,
        end: 4000,
      },
      {
        start: 4000,
        end: 8000,
      },
    ];
  }
  connectAudio(audio) {
    this.audioContext.resume();
    this.history = [];
    this.features = null;
    this.state = FSMStates.silence;
    if (this.audioSource === audio) {
      return;
    }
    this.audioSource = audio;
    if (!audio.src) {
      console.warn("An audio source must be set before connecting");
      return;
    }
    const source = this.audioContext.createMediaElementSource(audio);
    source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
  }
  async connectMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      return source;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      throw err;
    }
  }
  extractFeatures() {
    this.analyser.getByteFrequencyData(this.dataArray);
    const bandEnergies = this.bands.map(({ start, end }) => {
      const startBin = Math.round(start / this.binWidth);
      const endBin = Math.min(
        Math.round(end / this.binWidth),
        this.dataArray.length - 1
      );
      return average(Array.from(this.dataArray.slice(startBin, endBin))) / 255;
    });
    let sumAmplitude = 0;
    let weightedSum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const freq = i * this.binWidth;
      const amp = this.dataArray[i] / 255;
      sumAmplitude += amp;
      weightedSum += freq * amp;
    }
    const centroid = sumAmplitude > 0 ? weightedSum / sumAmplitude : 0;
    const volume = average(bandEnergies);
    const deltaBands = bandEnergies.map((energy, index) => {
      if (this.history.length < 2) return 0;
      const previousEnergy = this.history[this.history.length - 2].bands[index];
      return energy - previousEnergy;
    });
    const features = {
      bands: bandEnergies,
      deltaBands: deltaBands,
      volume,
      centroid,
    };
    if (sumAmplitude > 0) {
      this.history.push(features);
      if (this.history.length > this.historySize) {
        this.history.shift();
      }
    }
    return features;
  }
  getAveragedFeatures() {
    const len = this.history.length;
    const sum = {
      volume: 0,
      centroid: 0,
      bands: Array(this.bands.length).fill(0),
    };
    for (const f of this.history) {
      sum.volume += f.volume;
      sum.centroid += f.centroid;
      f.bands.forEach((b, i) => (sum.bands[i] += b));
    }
    const bands = sum.bands.map((b) => b / len);
    return {
      volume: sum.volume / len,
      centroid: sum.centroid / len,
      bands,
      deltaBands: bands,
    };
  }
  detectState() {
    const current = this.history[this.history.length - 1];
    if (!current) {
      this.state = FSMStates.silence;
      this.viseme = VISEMES.sil;
      return;
    }
    const avg = this.getAveragedFeatures();
    const dVolume = current.volume - avg.volume;
    const dCentroid = current.centroid - avg.centroid;
    const visemeScores = this.computeVisemeScores(
      current,
      avg,
      dVolume,
      dCentroid
    );
    const adjustedScores = this.adjustScoresForConsistency(visemeScores);
    let maxScore = -Infinity;
    let topViseme = VISEMES.sil;
    for (const viseme in adjustedScores) {
      if (adjustedScores[viseme] > maxScore) {
        maxScore = adjustedScores[viseme];
        topViseme = viseme;
      }
    }
    let newState = VISEMES_STATES[topViseme];
    this.state = newState;
    this.viseme = topViseme;
  }
  computeVisemeScores(current, avg, dVolume, dCentroid) {
    const scores = {
      [VISEMES.sil]: 0,
      [VISEMES.PP]: 0,
      [VISEMES.FF]: 0,
      [VISEMES.TH]: 0,
      [VISEMES.DD]: 0,
      [VISEMES.kk]: 0,
      [VISEMES.CH]: 0,
      [VISEMES.SS]: 0,
      [VISEMES.nn]: 0,
      [VISEMES.RR]: 0,
      [VISEMES.aa]: 0,
      [VISEMES.E]: 0,
      [VISEMES.I]: 0,
      [VISEMES.O]: 0,
      [VISEMES.U]: 0,
    };
    const [_b1, _b2, _b3, _b4, _b5, _b6, b7] = current.bands;
    if (avg.volume < 0.2 && current.volume < 0.2) {
      scores[VISEMES.sil] = 1.0;
    }
    Object.entries(VISEMES_STATES).forEach(([viseme, state]) => {
      if (state === FSMStates.plosive) {
        if (dVolume < 0.01) {
          scores[viseme] -= 0.5;
        }
        if (avg.volume < 0.2) {
          scores[viseme] += 0.2;
        }
        if (dCentroid > 1000) {
          scores[viseme] += 0.2;
        }
      }
    });
    if (current.centroid > 1000 && current.centroid < 8000) {
      if (current.centroid > 7000) {
        scores[VISEMES.DD] += 0.6;
      } else if (current.centroid > 5000) {
        scores[VISEMES.kk] += 0.6;
      } else if (current.centroid > 4000) {
        scores[VISEMES.PP] += 1;
        if (b7 > 0.25 && current.centroid < 6000) {
          scores[VISEMES.DD] += 1.4;
        }
      } else {
        scores[VISEMES.nn] += 0.6;
      }
    }
    if (dCentroid > 1000 && current.centroid > 6000 && avg.centroid > 5000) {
      if (current.bands[6] > 0.4 && avg.bands[6] > 0.3) {
        scores[VISEMES.FF] = 0.7;
      }
    }
    if (avg.volume > 0.1 && avg.centroid < 6000 && current.centroid < 6000) {
      const [b1, b2, b3, b4, b5] = avg.bands;
      const gapB1B2 = Math.abs(b1 - b2);
      const maxGapB2B3B4 = Math.max(
        Math.abs(b2 - b3),
        Math.abs(b2 - b4),
        Math.abs(b3 - b4)
      );
      if (b3 > 0.1 || b4 > 0.1) {
        if (b4 > b3) {
          scores[VISEMES.aa] = 0.8;
          if (b3 > b2) {
            scores[VISEMES.aa] += 0.2;
          }
        }
        if (b3 > b2 && b3 > b4) {
          scores[VISEMES.I] = 0.7;
        }
        if (gapB1B2 < 0.25) {
          scores[VISEMES.U] = 0.7;
        }
        if (maxGapB2B3B4 < 0.25) {
          scores[VISEMES.O] = 0.9;
        }
        if (b2 > b3 && b3 > b4) {
          scores[VISEMES.E] = 1;
        }
        if (b3 < 0.2 && b4 > 0.3) {
          scores[VISEMES.I] = 0.7;
        }
        if (b3 > 0.25 && b5 > 0.25) {
          scores[VISEMES.O] = 0.7;
        }
        if (b3 < 0.15 && b5 < 0.15) {
          scores[VISEMES.U] = 0.7;
        }
      }
    }
    return scores;
  }
  adjustScoresForConsistency(scores) {
    const adjustedScores = { ...scores };
    if (this.viseme && this.state) {
      for (const viseme in adjustedScores) {
        const isCurrentViseme = viseme === this.viseme;
        if (isCurrentViseme) {
          adjustedScores[viseme] *= 1.3;
        }
      }
    }
    return adjustedScores;
  }
  processAudio() {
    this.features = this.extractFeatures();
    this.detectState();
  }
}

export class LipSyncTTS {
  constructor() {
    this.lipsync = new Lipsync({
      fftSize: 2048,
      historySize: 10,
    });

    this.isProcessing = false;
    this.animationFrame = null;
    this.onVisemeChange = null; // Callback for viseme updates
    this.audioElement = null;
    this.manuallyStopped = false;
  }

  async speakWithPreRecordedAudio(text, options = {}) {
    try {
      this.stopProcessing();

      const audioUrl = await this.convertTextToAudioFile(text, options);
      return this.playAudioWithLipSync(audioUrl);
    } catch (error) {
      console.error("Error in speakWithPreRecordedAudio:", error);
      throw error;
    }
  }

  async playAudioWithLipSync(audioUrl) {
    return new Promise((resolve, reject) => {
      this.rejectPromise = reject;
      this.audioElement = new Audio(audioUrl);

      this.audioElement.onloadeddata = () => {
        // console.log("onloadeddata");

        this.lipsync.connectAudio(this.audioElement);
        this.startLipSyncProcessing();
        this.audioElement.play();
      };

      this.audioElement.onended = () => {
        this.stopProcessing();
        resolve();
      };

      this.audioElement.onerror = (error) => {
        console.error("Audio playback failed:", error);
        this.stopProcessing();
        reject(error);
      };

      this.audioElement.load();
    });
  }

  async convertTextToAudioFile(text, options) {
    // const { model = "tts-1", voice = "alloy", response_format = "mp3" } = options;

    try {
      return await createAudio(text);
    } catch (error) {
      console.error("Failed to generate audio from OpenAI:", error);
      throw error;
    }
  }

  startLipSyncProcessing() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processFrame();
  }

  processFrame() {
    if (!this.isProcessing) return;

    this.lipsync.processAudio();

    if (this.onVisemeChange && this.lipsync.viseme) {
      this.onVisemeChange(this.lipsync.viseme, this.lipsync.features);
    }

    this.animationFrame = requestAnimationFrame(() => this.processFrame());
  }

  stopProcessing() {
    this.isProcessing = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    if (this.onVisemeChange) {
      this.onVisemeChange(this.lipsync.viseme, null);
    }
  }

  stop() {
    // console.log("stop() called");
    this.manuallyStopped = true;
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    this.isProcessing = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  setOnVisemeChange(callback) {
    this.onVisemeChange = callback;
  }

  destroy() {
    this.stop();
  }
}
