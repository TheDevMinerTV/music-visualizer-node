const { ClientStream } = require('node-openpixelcontrol-stream-es6');
const { AudioContext } = require('node-webaudioapi-es6');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

const context = new AudioContext();

const FILE = 'test.mp3';
const NUM_LEDS = 150;

const SAMPLE_RATE = 0.015 * 1000;

const BRIGHTNESS_BOOST = 75;
const BRIGHTNESS_BOOST_FALLOFF = 3;
const BRIGHTNESS_BOOST_TRIGGER = 0.2;

/** @type {number[]} */
let history = Array(NUM_LEDS);
let boost = 0;

for (let i = 0; i < history.length; i++) {
	history[i] = 0;
}

const ledClient = new ClientStream();
const ledSocket = net.createConnection(7890, '172.31.179.23', () => {
	ledClient.pipe(ledSocket);

	main();
});

function rgb2Int(r, g, b) {
	return ((r & 0xff) << 16) + ((g & 0xff) << 8) + (b & 0xff);
}

function colorwheel(pos) {
	pos = 255 - pos;

	if (pos < 85) {
		return [255 - pos * 3, 0, pos * 3];
	} else if (pos < 170) {
		pos -= 85;

		return [0, pos * 3, 255 - pos * 3];
	} else {
		pos -= 170;

		return [pos * 3, 255 - pos * 3, 0];
	}
}

function render() {
	const res = new Uint32Array(NUM_LEDS);

	for (let i = 0; i < NUM_LEDS; i++) {
		let r;
		let g;
		let b;

		if (history[i] > 0.1) {
			[r, g, b] = colorwheel(history[i] * 255);
		} else {
			r = 0;
			g = 0;
			b = 0;
		}

		// res[i] = rgb2Int(boost, boost, boost)

		res[i] = rgb2Int(
			Math.min(Math.max(r - BRIGHTNESS_BOOST, 0), BRIGHTNESS_BOOST) + boost,
			Math.min(Math.max(g - BRIGHTNESS_BOOST, 0), BRIGHTNESS_BOOST) + boost,
			Math.min(Math.max(b - BRIGHTNESS_BOOST, 0), BRIGHTNESS_BOOST) + boost
		);
	}

	return res;
}

async function main() {
	ledClient.setPixelColors(1, render());

	console.log(`[Decoder] Decoding file ${FILE}`);

	const buf = fs.readFileSync(FILE);

	/** @type {import('node-webaudioapi-es6').AudioBuffer} */
	const audioBuffer = await new Promise((res, rej) =>
		context.decodeAudioData(
			buf,
			(audioBuffer) => res(audioBuffer),
			(err) => rej(err)
		)
	);

	console.log(`[Decoder] Decoded file`);
	console.log(
		`[Decoder] ${audioBuffer.numberOfChannels} channels | ${audioBuffer.length} bytes | ${audioBuffer.sampleRate} kHz | ${audioBuffer.duration} seconds`
	);

	playFile(FILE);
	findPeaks(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
}

function findPeaks(pcm, samplerate) {
	const step = Math.round(samplerate * (SAMPLE_RATE / 1000));

	let index = 0;
	let max = 0;
	let previousMax = 0;

	//loop through song in time with sample rate
	const sampleInterval = setInterval(function () {
		if (index >= pcm.length) {
			clearInterval(sampleInterval);

			console.log('[Sampler] Finished sampling sound');
			ledSocket.destroy();

			return;
		}

		history.pop();

		for (let i = index; i < index + step; i++) {
			max = pcm[i] > max ? +pcm[i].toFixed(2) : max;
		}

		//let bars = getBars(max);

		if (boost > BRIGHTNESS_BOOST_FALLOFF) {
			boost -= BRIGHTNESS_BOOST_FALLOFF;
		}

		if (max - previousMax >= BRIGHTNESS_BOOST_TRIGGER) {
			boost = BRIGHTNESS_BOOST;

			//bars = bars + ' == peak ==';
		}

		history.unshift(max);

		// console.log(bars, max);
		ledClient.setPixelColors(1, render());

		previousMax = max;
		max = 0;
		index += step;
	}, SAMPLE_RATE);
}

function getBars(val) {
	let bars = '';

	for (let i = 0; i < val * 50 + 2; i++) {
		bars = bars + '|';
	}

	return bars;
}

function playFile(soundfile) {
	// const audioProcess = exec(`aplay ${soundfile}`, { maxBuffer: 1024 * 500 }, (error) =>
	const audioProcess = spawn(`ffplay -volume 100 -autoexit ${soundfile}`, { maxBuffer: 1024 * 500 }, (error) =>
		console.log(error ? `[Player] Start failed: ${error}` : '[Player] Started')
	);

	audioProcess.on('exit', (code) => console.log(`[Player] Exited with code ${code}`));
}
