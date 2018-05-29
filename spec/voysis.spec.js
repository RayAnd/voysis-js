'use strict';

describe('Test static pieces of information', function () {

    it('Version number exists', function () {
        expect(VoysisSession.version).toBe('${LIBRARY_VERSION}');
    });
});

describe('Test issue app token', function () {

    const websocketHost = 'mycompany.voysis.io';
    const refreshToken = 'myRefreshToken';

    it('Issue app token, no refresh token', function (done) {
        var voysisSession = new VoysisSession({
            host: websocketHost,
            audioProfileId: 'myAudioProfileId',
            debugEnabled: true
        });
        try {
            voysisSession.issueAppToken();
            fail('Expected the method call to fail');
            done();
        } catch (err) {
            expect(err.message).toEqual('A refresh token is required to issue an application token.');
            done();
        }
    });

    it('Issue app token, permission denied', function (done) {
        const mockServer = new Mock.Server(`wss://${websocketHost}/websocketapi`);
        mockServer.on('message', requestJson => {
            const request = JSON.parse(requestJson);
            if (request.restUri === '/tokens' && request.headers.Authorization == `Bearer ${refreshToken}`) {
                const response = {
                    requestId: request.requestId,
                    responseCode: 401,
                    responseMessage: 'Unauthorized',
                    type: 'response'
                };
                mockServer.send(JSON.stringify(response));
            }
        });
        var voysisSession = new VoysisSession({
            host: websocketHost,
            audioProfileId: 'myAudioProfileId',
            refreshToken: refreshToken,
            debugEnabled: true
        });
        voysisSession.issueAppToken().then(function () {
            fail('Expected the method call to fail');
            mockServer.stop(done);
        }).catch(function (response) {
            expect(response.responseCode).toEqual(401);
            expect(response.responseMessage).toEqual('Unauthorized');
            mockServer.stop(done);
        });
    });

    it('Issue app token', function (done) {
        const mockServer = new Mock.Server(`wss://${websocketHost}/websocketapi`);
        const expectedAppToken = {
            token: 'yourAppToken',
            expiresAt: '2009-02-13T23:31:30.123Z',
            expiresAtEpoch: 1234567890123
        };
        mockServer.on('message', requestJson => {
            const request = JSON.parse(requestJson);
            if (request.restUri === '/tokens' && request.headers.Authorization == `Bearer ${refreshToken}`) {
                const response = {
                    entity: expectedAppToken,
                    requestId: request.requestId,
                    responseCode: 200,
                    responseMessage: 'OK',
                    type: 'response'
                };
                mockServer.send(JSON.stringify(response));
            }
        });
        var voysisSession = new VoysisSession({
            host: websocketHost,
            audioProfileId: 'myAudioProfileId',
            refreshToken: refreshToken,
            debugEnabled: true
        });
        voysisSession.issueAppToken().then(function (appToken) {
            expect(appToken).toEqual(expectedAppToken);
            mockServer.stop(done);
        }).catch(function (err) {
            fail(err);
            mockServer.stop(done);
        });
    });
});