Voysis Javascript SDK
=====================
[![Build Status](https://travis-ci.org/voysis/voysis-js.svg)](https://travis-ci.org/voysis/voysis-js)

This document provides a brief overview of the voysis javascript sdk.
This is a javascript library that facilitates sending voice
queries to a Voysis instance. The client allows audio to be
streamed from the device microphone.

Build & Test
------------
_If you haven't used [grunt](https://gruntjs.com/) before, be sure to check out the [Getting Started](https://gruntjs.com/getting-started) guide._

Assuming you have grunt installed, install the project's dependencies

```bash
npm install
```

Once that's done, you can run the unit tests via `grunt test` or `npm test`

Creating the files for distribution can be done by `grunt dist`

Running `grunt` will run the default tasks, which will test and lint the code, and build the distribution.

Documentation
-------------

The full documentation for this library can be found here: [Voysis Developer Documentation](https://developers.voysis.com/docs) 

Basic Usage
-----------

The first step to using the lib is to create a VoysisSession.

```js
    var voysisSession = new VoysisSession({
        host: 'mycompany.voysis.io',
        audioProfileId: '123e4567-e89b-12d3-a456-426655440000'
    });
```

From here, the simplest usage is to call sendAudioQuery, which
takes the language which will be used as a parameter.

```js
    voysisSession.sendAudioQuery('en-US').then(function (queryResult) {
        console.log('You said: ' + queryResult.textQuery.text);
    }).catch(function (error) {
        console.log("ERROR: ", error.message);
    });
```

The object passed to the callback will be the result of the query.

For more detailed info, check the documentation above.
