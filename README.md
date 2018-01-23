Voysis Javascript SDK
=====================

This document provides a brief overview of the voysis javascript sdk.
This is a javascript library that facilitates sending voice
queries to a Voysis instance. The client allows audio to be
streamed from the device microphone.

Documentation
-------------

The full documentation for this library can be found here: [Voysis Developer Documentation](https://developers.voysis.com/docs) 

Basic Usage
-----------

The first step to using the lib is to create a VoysisSession.

    var voysisSession = new VoysisSession({
        host: 'mycompany.voysis.io',
        audioProfile: 'f8338e44-9d48-11e7-abc4-cec278b6b50a'
    });

From here, the simplest usage is to call sendAudioQuery, which
takes the language which will be used as a parameter.

    voysisSession.sendAudioQuery('en-us').then(function (queryResult) {
        console.log('You said: ' + queryResult['textQuery']['text']);
    }).catch(function (error) {
        console.log("ERROR: " + JSON.stringify(error));
    });

The object passed to the callback will be the result of the query.

For more detailed info, check the documentation above.
