import { el } from '../ui.js';

const rules = `
  <p><strong>Under redesign.</strong> Threshold is being reworked and is a
  placeholder for now. It scores <strong>0</strong> for the current session;
  a replacement event will take this slot in a future update.</p>
`;

export default {
  id: 'threshold',
  decathlon: 'ryno',
  name: 'Threshold',
  blurb: 'Under redesign — placeholder event.',
  rulesHtml: rules,
  rounds: 1,

  async play(host) {
    host.appendChild(el('div', {
      class: 'status',
      html: 'This event is under redesign and scores <strong>0</strong> for now.',
    }));
    return 0;
  },
};
