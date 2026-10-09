/* Waveboard split on the live page. The only input is the waveboard object
   the feed pass already put on the feed. No second poll and no GitHub call.
   Tests: node --test house/live-mesh/test_waveboard_page.mjs */
(function (root) {
  'use strict';

  var STAGES = ['open', 'review', 'fix', 'merge', 'retest', 'done'];
  var NARROW = 720;
  var FIELDS = [
    ['goal', 'goal'],
    ['constraints', 'constraints'],
    ['path', 'path'],
    ['acceptance', 'acceptance'],
    ['evidence', 'evidence'],
    ['next_owner', 'next owner'],
    ['escalate', 'escalate']
  ];

  function groupCards(cards) {
    var groups = {};
    STAGES.forEach(function (stage) { groups[stage] = []; });
    (cards || []).forEach(function (card) {
      var stage = STAGES.indexOf(card.stage) >= 0 ? card.stage : 'open';
      groups[stage].push(card);
    });
    return groups;
  }

  function beatKey(card) {
    var beat = card && card.beats && card.beats[0];
    return beat ? card.id + '\n' + beat.id : '';
  }

  /* seen is null until the first paint, so the opening board does not glow. */
  function glowIds(cards, seen) {
    var glow = {};
    if (!seen) return glow;
    (cards || []).forEach(function (card) {
      var key = beatKey(card);
      if (key && !seen[key]) glow[card.id] = true;
    });
    return glow;
  }

  function noteBeats(cards, seen) {
    var next = seen || {};
    (cards || []).forEach(function (card) {
      var key = beatKey(card);
      if (key) next[key] = 1;
    });
    return next;
  }

  function ageText(age) {
    if (typeof age !== 'number' || age < 0) return '';
    if (age < 60) return age + 's';
    var minutes = Math.floor(age / 60);
    if (minutes < 60) return minutes + ' min';
    return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
  }

  function layout(width) {
    return width <= NARROW ? 'toggle' : 'split';
  }

  function view(board, selectedId, seen) {
    var cards = (board && board.cards) || [];
    var selected = null;
    cards.forEach(function (card) {
      if (card.id === selectedId) selected = card;
    });
    return {
      stages: STAGES,
      groups: groupCards(cards),
      glow: glowIds(cards, seen),
      selected: selected,
      fields: FIELDS
    };
  }

  root.Waveboard = {
    STAGES: STAGES,
    NARROW: NARROW,
    FIELDS: FIELDS,
    groupCards: groupCards,
    glowIds: glowIds,
    noteBeats: noteBeats,
    ageText: ageText,
    layout: layout,
    view: view
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
