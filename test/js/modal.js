$(".show-feedback-modal").click(function() {
  $("#feedbackModal").addClass("is-active"); 
});

$(".show-settings-modal").click(function() {
  $('#gettingStartedModal').find('[data-mode=full]').show();
  $("#gettingStartedModal").addClass("is-active");
});

$(".modal-card-close").click(function() {
   $(".modal").removeClass("is-active");
});

$(".modal-background").click(function() {
   $(".modal").removeClass("is-active");
});
