$(".show-text-modal").click(function() {
  $("#textinputModal").addClass("is-active");
});

$(".show-feedback-modal").click(function() {
  $("#feedbackModal").addClass("is-active"); 
});

$(".show-settings-modal").click(function() {
  $("#settings-modal").addClass("is-active");
  $("#vad-enabled-checkbox").prop('checked', voysisClient.getIgnoreVad())
});

$(".modal-card-close").click(function() {
   $(".modal").removeClass("is-active");
});

$(".modal-background").click(function() {
   $(".modal").removeClass("is-active");
});
