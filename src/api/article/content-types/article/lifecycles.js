'use strict';

const WORDS_PER_MINUTE = 200;

function formatDate(date) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const d = new Date(date);
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function calculateReadTime(content) {
  if (!content) return '1 min read';
  const words = content.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}

module.exports = {
  beforeCreate(event) {
    const { data } = event.params;

    if (!data.date) {
      data.date = formatDate(new Date());
    }

    if (!data.readTime) {
      data.readTime = calculateReadTime(data.content);
    }
  },

  beforeUpdate(event) {
    const { data } = event.params;

    if (data.content !== undefined) {
      data.readTime = calculateReadTime(data.content);
    }
  },
};
