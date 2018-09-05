document.addEventListener('DOMContentLoaded', function () {
  // Get all "navbar-burger" elements
  var $micIcon = Array.prototype.slice.call(document.querySelectorAll('.is-mic-button'), 0);
  var $sendTxt = Array.prototype.slice.call(document.querySelectorAll('.is-sendTxt-button'), 0);
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

  if ($sendTxt.length > 0) {
    $sendTxt.forEach(function ($el) {
      $el.addEventListener('click', function () {
        if (!$el.classList.contains('is-active')) {
          $el.classList.add('is-active');
          text = document.getElementById('text_query_input').value
          startTextQuery(text, $el)
        } else {
          $el.classList.remove('is-active');
        }
      });
    });
  }
});

