document.addEventListener('DOMContentLoaded', function () {
  // Get all "navbar-burger" elements
  var $micIcon = Array.prototype.slice.call(document.querySelectorAll('.is-mic-button'), 0);
  // Check if there are any navbar burgers
  if ($micIcon.length > 0) {
    // Add a click event on each of them
    $micIcon.forEach(function ($el) {
      $el.addEventListener('click', function () {
        // Activate the button and start streaming
        if (!$el.classList.contains('is-active')) {
            $el.classList.add('is-active');
            startQuery($el);
        } else {
            $el.classList.remove('is-active');
            stopQuery();
        }
      });
    });
  }
});

