import { FFmpeg } from '..';

export interface FileRef {
    name: string;
    format: string;
    data: Blob;
}

export default async function videoToAudio(videoFileData: Blob): Promise<FileRef | void> {
  try {
    const reader = new FileReader();
    return new Promise((resolve) => {
      reader.onload = function (/* event: Event */) {
        const contentType = 'audio/mpeg';
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        let myBuffer;
        const sampleRate = 16000;
        const numberOfChannels = 1;
        const videoFileAsBuffer = reader.result;
        audioContext
          .decodeAudioData(videoFileAsBuffer as ArrayBuffer)
          .then(function (decodedAudioData) {
            const duration = decodedAudioData.duration;
            const offlineAudioContext = new OfflineAudioContext(
              numberOfChannels,
              sampleRate * duration,
              sampleRate
            );
            const soundSource = offlineAudioContext.createBufferSource();
            myBuffer = decodedAudioData;
            soundSource.buffer = myBuffer;
            soundSource.connect(offlineAudioContext.destination);
            soundSource.start();
            offlineAudioContext
              .startRendering()
              .then(function (renderedBuffer) {
                const UintWave = createWaveFileData(renderedBuffer);
                const b64Data = btoa(uint8ToString(UintWave));
                const blob = getBlobFromBase64Data(b64Data, contentType);
                // const blobUrl = URL.createObjectURL(blob);

                const convertedAudio = {
                  name: videoFileData.name.substring(
                    0,
                    videoFileData.name.lastIndexOf(".")
                  ),
                  format: 'mpeg',
                  data: blob,
                };
                resolve(convertedAudio);
              })
              .catch(function (err) {
                console.log("Rendering failed: " + err);
              });
          });
      };
      reader.readAsArrayBuffer(videoFileData);
    });
  } catch (e) {
    console.log("Error occurred while converting : ", e);
  }
}

function getBlobFromBase64Data(b64Data: string, contentType: string, sliceSize = 512) {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  const blob = new Blob(byteArrays, { type: contentType });
  return blob;
}

function createWaveFileData(audioBuffer: AudioBuffer) {
  const frameLength = audioBuffer.length;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numberOfChannels * bitsPerSample) / 8;
  const blockAlign = (numberOfChannels * bitsPerSample) / 8;
  const wavDataByteLength = frameLength * numberOfChannels * 2;
  const headerByteLength = 44;
  const totalLength = headerByteLength + wavDataByteLength;

  const waveFileData = new Uint8Array(totalLength);

  const subChunk1Size = 16;
  const subChunk2Size = wavDataByteLength;
  const chunkSize = 4 + (8 + subChunk1Size) + (8 + subChunk2Size);

  writeString("RIFF", waveFileData, 0);
  writeInt32(chunkSize, waveFileData, 4);
  writeString("WAVE", waveFileData, 8);
  writeString("fmt ", waveFileData, 12);

  writeInt32(subChunk1Size, waveFileData, 16);
  writeInt16(1, waveFileData, 20);
  writeInt16(numberOfChannels, waveFileData, 22);
  writeInt32(sampleRate, waveFileData, 24);
  writeInt32(byteRate, waveFileData, 28);
  writeInt16(blockAlign, waveFileData, 32);
  writeInt32(bitsPerSample, waveFileData, 34);

  writeString("data", waveFileData, 36);
  writeInt32(subChunk2Size, waveFileData, 40);

  writeAudioBuffer(audioBuffer, waveFileData, 44);

  return waveFileData;
}

function writeString(s: string, a: Uint8Array, offset: number) {
  for (let i = 0; i < s.length; ++i) {
    a[offset + i] = s.charCodeAt(i);
  }
}

function writeInt16(n: number, a: Uint8Array, offset: number) {
  n = Math.floor(n);

  const b1 = n & 255;
  const b2 = (n >> 8) & 255;

  a[offset + 0] = b1;
  a[offset + 1] = b2;
}

function writeInt32(n: number, a: Uint8Array, offset: number) {
  n = Math.floor(n);
  const b1 = n & 255;
  const b2 = (n >> 8) & 255;
  const b3 = (n >> 16) & 255;
  const b4 = (n >> 24) & 255;

  a[offset + 0] = b1;
  a[offset + 1] = b2;
  a[offset + 2] = b3;
  a[offset + 3] = b4;
}

function writeAudioBuffer(audioBuffer: AudioBuffer, a: Uint8Array, offset: number) {
  const n = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;

  for (let i = 0; i < n; ++i) {
    for (let k = 0; k < channels; ++k) {
      const buffer = audioBuffer.getChannelData(k);
      let sample = buffer[i] * 32768.0;

      if (sample < -32768) sample = -32768;
      if (sample > 32767) sample = 32767;

      writeInt16(sample, a, offset);
      offset += 2;
    }
  }
}

function uint8ToString(buf: Uint8Array) {
  let i,
    length,
    out = "";
  for (i = 0, length = buf.length; i < length; i += 1) {
    out += String.fromCharCode(buf[i]);
  }
  return out;
}

export type Video = {
  input: File;
  output: File;
  summary: string;
  loading: boolean;
  progress: string;
  transcription: string;
};

const { createFFmpeg, fetchFile } = window.FFmpeg;
let ffmpeg: FFmpeg | null = null;

export async function transcode(video: Video): Promise<Video> {
  try {
    video.loading = true;
    if (ffmpeg === null) {
      ffmpeg = createFFmpeg({ log: true });
    }
    const { name } = video.input;
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }
    ffmpeg.setProgress(({ ratio }) => {
      video.progress = `Transcoding ${Math.floor(ratio * 100)}%`;
    });
    ffmpeg.FS("writeFile", name, await fetchFile(video.input));
    await ffmpeg.run("-i", name, "output.mpeg");
    const data = ffmpeg.FS("readFile", "output.mpeg");
    const blob = new Blob([data.buffer], { type: "audio/mpeg" });
    video.output = new File([blob], "output.mpeg");
  } catch (error) {
    try {
        video.loading = true;
        const blob = await videoToAudio(video.input);
        if (blob) {
          video.output = new File([blob.data], "output.mpeg");
        }
    } catch (error) {
      video.progress = "Transcoding error";
    }
  }
  return video;
}