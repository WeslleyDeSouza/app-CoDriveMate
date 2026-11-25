import {
  LandmarkAround,
  carRemark,
  directionTo,
  firstSentences,
  isStop,
  mayTalk,
  parseQuiz,
  pickLandmark,
  pickMode,
  quizAnswer,
} from './conversation';
import {
  CarSnapshot,
  assistantPrompt,
  passengerPrompt,
  questionText,
  snapshotText,
  spokenText,
} from './copilot';

const snapshot: CarSnapshot = {
  vehicle: 'Citroën Xsara Picasso, 1.8 l',
  source: 'obd',
  live: { speed_kmh: 49.96, coolant_c: null },
  street: 'Bahnhofquai',
  codes: null,
  lamp: null,
  limitKmh: null,
  traffic: [],
  destination: { name: 'Bern', nextManeuverM: 420.4, arrival: '18:10', remainingKm: 98.76 },
};

describe('what the copilot is told', () => {
  it('leaves out what is missing', () => {
    expect(JSON.parse(snapshotText(snapshot))).toEqual({
      vehicle: 'Citroën Xsara Picasso, 1.8 l',
      data_source: 'OBD2 live',
      live: { speed_kmh: 50 },
      street: 'Bahnhofquai',
      navigation: {
        destination: 'Bern',
        next_maneuver_m: 420,
        arrival: '18:10',
        remaining_km: 98.8,
      },
      fault_codes: 'not read',
    });
    const none = snapshotText({ ...snapshot, source: 'none', street: '', destination: null });
    expect(JSON.parse(none)).toMatchObject({ live: 'no data' });
    expect(none).not.toContain('navigation');
  });

  it('never contains coordinates', () => {
    expect(questionText('?', snapshot)).not.toMatch(/\d+\.\d{4,}/);
  });

  it('forbids help against speed checks in every prompt', () => {
    for (const prompt of [assistantPrompt('Car', 'de'), passengerPrompt('en')]) {
      expect(prompt).toContain('speed cameras');
    }
    expect(assistantPrompt('Car', 'de')).toContain('never ß');
  });

  it('removes markdown for the voice', () => {
    expect(spokenText('**Gut**:\n- `12.4` V')).toBe('Gut: - 12.4 V');
  });
});

describe('conversation', () => {
  it('is silent near a manoeuvre, during speech, warnings and in the background', () => {
    const free = { maneuverM: null, speaking: false, visible: true, warning: false };
    expect(mayTalk(free)).toBe(true);
    expect(mayTalk({ ...free, maneuverM: 900 })).toBe(true);
    expect(mayTalk({ ...free, maneuverM: 699 })).toBe(false);
    expect(mayTalk({ ...free, speaking: true })).toBe(false);
    expect(mayTalk({ ...free, visible: false })).toBe(false);
    expect(mayTalk({ ...free, warning: true })).toBe(false);
  });

  it('understands that the driver wants silence', () => {
    for (const text of ['Stopp', 'bitte aufhören!', 'Ruhe', 'ok enough']) {
      expect(isStop(text)).toBe(true);
    }
    for (const text of ['Wo ist der nächste Aussichtspunkt?', 'Genugtuung', '']) {
      expect(isStop(text)).toBe(false);
    }
  });

  it('mixes the chosen modes without repeating one', () => {
    const all = ['chat', 'facts', 'quiz'] as const;
    expect(pickMode(all, null, () => 0.99)).toBe('quiz');
    expect(pickMode(all, 'quiz', () => 0.99)).toBe('facts');
    expect(pickMode(['facts'], 'facts', () => 0.5)).toBe('facts');
    expect(pickMode([], null, () => 0)).toBeNull();
  });

  it('remarks on the car only when there is something to say', () => {
    expect(carRemark(300, 88, 50, true)).toBe('');
    expect(carRemark(62.4, 88, 50, true)).toBe('tank almost empty, about 62 km left');
    expect(carRemark(null, 20, 0, true)).toBe('engine still cold, standing still');
    expect(carRemark(10, 20, 0, false)).toBe('');
    expect(passengerPrompt('de')).toContain('never joke about danger');
  });

  it('says where a place is', () => {
    expect(directionTo(10, 350, 50)).toBe('ahead');
    expect(directionTo(90, 0, 50)).toBe('right');
    expect(directionTo(270, 0, 50)).toBe('left');
    expect(directionTo(180, 0, 50)).toBe('behind');
    expect(directionTo(180, 0, 0)).toBe('near');
  });

  it('prefers unknown places ahead', () => {
    const place = (id: number, distanceM: number, direction: LandmarkAround['direction']) =>
      ({ id, title: '', at: [0, 0], distanceM, direction }) as LandmarkAround;
    const places = [
      place(1, 300, 'behind'),
      place(2, 2000, 'ahead'),
      place(3, 100, 'ahead'),
      place(4, 500, 'left'),
    ];
    expect(pickLandmark(places, new Set())?.id).toBe(2);
    expect(pickLandmark(places, new Set([2]))?.id).toBe(4);
    expect(pickLandmark(places, new Set([1, 2, 4]))).toBeNull();
  });

  it('cuts texts at sentences', () => {
    const text = 'Das ist St. Peter. Er steht in Zürich. Mehr dazu.';
    expect(firstSentences('Eins ist da. Zwei auch. Drei nicht.', 2, 280)).toBe(
      'Eins ist da. Zwei auch.',
    );
    expect(firstSentences(text, 9, 20).length).toBeLessThanOrEqual(21);
  });
});

describe('quiz', () => {
  const raw =
    '{"question":"Höchster Berg?","a":"Dom","b":"Dufourspitze","c":"Eiger","correct":"b","explanation":"4634 m."}';
  const quiz = parseQuiz(raw)!;

  it('accepts only complete questions', () => {
    expect(quiz.correct).toBe('b');
    expect(parseQuiz('Hier: ' + raw)).toEqual(quiz);
    expect(parseQuiz(raw.replace('"b","exp', '"d","exp'))).toBeNull();
    expect(parseQuiz('{"question":""}')).toBeNull();
    expect(parseQuiz('nein')).toBeNull();
  });

  it('understands letters and answers', () => {
    expect(quizAnswer('B', quiz)).toBe('b');
    expect(quizAnswer('Antwort zeh', quiz)).toBe('c');
    expect(quizAnswer('ich glaube die Dufourspitze', quiz)).toBe('b');
    expect(quizAnswer('keine Ahnung', quiz)).toBeNull();
    expect(quizAnswer('', quiz)).toBeNull();
  });
});
