/**
 * My attempt at an audio controller.
 *
 * The gist here is, we'll create some metadata for 3 "tracks" of music (each
 * track is just a sequence of oscillator nodes). Create 3 individual gain nodes,
 * for volume control, and attach everything up.
 *
 * Updating the audio controller involves checking whether we're near the end of
 * a track (if we are, schedule another loop of it), plus updating any volume
 * knobs as appropriate.
 */
class Audio {
    constructor() {
        let ctxClass = (window.AudioContext || window.webkitAudioContext);
        if (ctxClass) {
            this.ctx = new ctxClass();
        } else {
            this.disabled = true;
            return;
        }

        this.gain = {
            bg: this.ctx.createGain(),
            click: this.ctx.createGain(),
            sfx: this.ctx.createGain()
        };

        this.gain.bg.gain.value = 0.4;
        this.gain.bg.connect(this.ctx.destination);

        this.gain.click.gain.value = 0.1;
        this.gain.click.connect(this.ctx.destination);

        this.gain.sfx.gain.value = 0.6;
        this.gain.sfx.connect(this.ctx.destination);

        this.tick = 0;
        this.tickLength = 1/5;
        this.cents = 0;
        this.nextTick = this.tickLength;

        this.last = {
            click: 0
        };
    }

    update(delta) {
        if (this.disabled) return;

        if (game.player && game.player.dead) {
            this.gain.bg.gain.value = Math.max(0, 0.4 - game.deathFrame / 1000);
        } else {
            this.gain.bg.gain.value = 0.4;
        }

        // Each frame, schedule some notes if we're less than a second away from when
        // the next note should be played.
        if (this.nextTick - this.ctx.currentTime < 0.2) {
            this.scheduleForTick(this.tick, this.nextTick, this.tickLength, this.gain.bg);
            this.tick++;

            // If we go into the background, the Audio Context's currentTime will keep increasing,
            // but Audio.update will stop running (because we only run when the next animation
            // frame is received). This "automatically" stops our bg music when switching tabs,
            // which I think is a feature-not-a-bug. However, when we come back, we need to
            // make sure we don't spend a bunch of frames slowly catching back up to the
            // current time.
            if (this.nextTick < this.ctx.currentTime) this.nextTick = this.ctx.currentTime;

            this.nextTick += this.tickLength;
        }

        // Do some basic gain manipulation
        /*if (game.menu || game.intro || game.player.dead || game.levelComplete) {
            if (this.gain > 0.4) {
                this.gain -= delta / 3.5;
            } else if (this.gain < 0.4) {
                this.gain += delta / 3.5;
            }
        } else {
            if (this.gain < 0.7) {
                this.gain += delta / 3.5;
            }
        }
        this.gainNode.gain.value = this.gain;*/
    }

    scheduleForTick(tick, nextTick, tickLength, dest) {
        // I am not a music expert, so please assume that any statements I make about
        // keys, chords, and other music theory in these comments may be 100% wrong.

        // I experimented with more complicated 3- and 4-note chords, which
        // sound good on the piano, but my experiments seemed to show that less-is-more
        // when dealing with simple oscillators (you'd need a more complicated instrument,
        // I think, for big min7 type chords to sound good).

        // Overall, this is just a C minor chord, alternating fingers 1+3 and 1+5, with
        // scattered dissonant (but not too dissonant) notes in between. Where I could, I
        // tried to give it this odd start/stop feeling (like carnival music?) by alternating
        // where the interstitial notes ended up (beat 3 vs beat 2/4).
        let track = [
            // Measure 1
            [22, 19], // C Eb
            [],
            [],
            [],
            [22, 15], // C G
            [21],     // C#
            [],
            [],
            [22, 19], // C Eb
            [],
            [16],     // F#
            [],
            [22, 15], // C G
            [],
            [14],     // Ab
            [],

            // Measure 2
            [22, 19], // C Eb
            [],
            [],
            [16],     // F#
            [22, 15], // C G
            [],
            [20],     // D
            [],
            [22, 19], // C Eb
            [14],     // Ab
            [],
            [16],     // F#
            [22, 15], // C G
            [],
            [21],     // C#
            [20]      // D
        ];

        // Track 2 is Track 1 plus major 3rd (+4 notes), this transition sounds "normal", but
        // makes the next transition a little more jarring.
        let track2 = track.map(x => {
            return x.map(y => y - 4);
        });
        // tweak: maj3rd -> min3rd sounds muddled unless we move the last couple notes a few higher
        track2[30] = [16];
        track2[31] = [15];

        // Track 3 is Track 1 plus minor 3rd (+3 notes), a simple sinister transition.
        let track3 = track.map((x, i) => {
            return x.map(y => y - 3);
        });

        // Full 4 = our sequence in key of [C, C, E, Eb], repeat.
        track = track.concat(track).concat(track2).concat(track3);

        let notes = track[tick % track.length];
        let noteLength = tickLength * 1.39;

        // Oscillator creation taken from the generator at https://xem.github.io/miniMusic/advanced.html,
        // although I ended up moving the note creation out of the loop below, just so it is easier for
        // me to reason about.
        for (let i = 0; i < notes.length; i++) {
            let o = this.ctx.createOscillator();
            let freq = 988/1.06**notes[i];
            let cents = Math.floor(Math.random() * this.cents);
            o.frequency.value = freq;
            o.type = 'triangle';
            o.detune.value = cents;
            o.connect(dest);
            o.start(nextTick);

            // When to "stop" this note turns out to be surprisingly important; the obvious value is just
            // (start + note length), but there's a lot of ugly clicking at the end of each note. See
            // http://alemangui.github.io/blog//2015/12/26/ramp-to-value.html for an explanation. Unlike
            // the author's solution, though, I don't want to mess around with gain ramping because
            // we have a whole bunch of other notes to play, so instead, we try to land the "end" of the
            // oscillation at a multiple of (1/freq), where we'll be at 0, for a clean note exit.
            //
            // TODO: This is frustrating because I'd like to play with, for example, detuning and frequency
            // modulation (gives a creepy jewelry box sound); however, changing +/-cents on my note
            // changes the frequency, and my note length calculation becomes invalid. I should be modulating
            // the gain instead at the end of the note, but it interferes with the next note. Needs more
            // research, I guess...
            //
            // If we DO use cents, take it into account (to find the real zero point).
            let rfreq = freq * Math.pow(2, cents / 1200);

            // Basically "noteLength -= noteLength % rfreq", except it doesn't end up being zero.
            noteLength = Math.floor(noteLength * rfreq) / rfreq;

            o.stop(nextTick + noteLength);
        }
    }

    playClick() {
        if (this.disabled) return;

        let time = this.ctx.currentTime;
        if (time - this.last.click < 0.05) return;
        this.last.click = time;

        let note = 1;
        let o = this.ctx.createOscillator();
        let freq = 988/1.06**note;
        let cents = 0;
        o.frequency.valu = freq;
        o.frequency.exponentialRampToValueAtTime(freq * 0.6, time + 0.1);
        o.type = 'sine';
        o.detune.value = cents;
        o.connect(this.gain.click);
        o.start(time);
        o.stop(time + 0.01);
    }

    playBloop() {
        if (this.disabled) return;

        let time = this.ctx.currentTime;

        // We could probably do a similar check here, but we typically only play bloop in
        // response to user input, and they can only click so fast.

        let note = 28;
        let o = this.ctx.createOscillator();
        let freq = 988/1.06**note;
        let cents = 0;
        o.frequency.value = freq;
        o.frequency.exponentialRampToValueAtTime(freq * 1.6, time + 0.2);
        o.type = 'square';
        o.detune.value = cents;
        o.connect(this.gain.sfx);
        o.start(time);
        o.stop(time + 0.09);
    }

    playSiren() {
        if (this.disabled) return;

        let time = this.ctx.currentTime;

        // We could probably do a similar check here, but we typically only play bloop in
        // response to user input, and they can only click so fast.

        let note = 11;
        let o = this.ctx.createOscillator();
        let freq = 988/1.06**note;
        let cents = 0;
        o.frequency.value = freq;
        o.frequency.exponentialRampToValueAtTime(freq * 2, time + 1.1);
        o.type = 'sawtooth';
        o.detune.value = cents;
        o.connect(this.gain.click);
        o.start(time);
        o.stop(time + 0.65);
    }
}
