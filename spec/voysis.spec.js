'use strict';

describe("Test static pieces of information", function () {

    it("Version number exists", function () {
        expect(VoysisSession.version).toBe("${LIBRARY_VERSION}");
    });
});