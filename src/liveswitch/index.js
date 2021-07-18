
import Vue from 'vue';
import ls from 'fm.liveswitch';

let instance;

export const getInstance = () => instance;

export const useLiveSwitch = ({
    applicationId = 'dc9b8aff-990f-4de4-8436-5a29ba268015',
    token = '-generate-on-the-server',
    gatewayUrl = 'https://cloud.liveswitch.io',
    onLocalMediaReady = function(){},
    onParticipantJoin = function(){},
    onParticipantLeave = function(){}
    ///...options
}) => {

    if (instance) return instance;

    // The 'instance' is simply a Vue object
    instance = new Vue({
        data() {
            return {
                
            };
        },
        methods: {
            /** Authenticates the user using a popup window */
            async startStreaming() {
                var promise = new ls.Promise()
                try {
                    
                    this.client = new ls.Client(gatewayUrl, applicationId);
                    this.connectionRecords = {}

                    const channels = await this.client.register(token);
                    
                    // we auto-joined one channel, so just use that one; we can get more complex later
                    this.channel = channels[0]

                    // start local media - camera/microphone
                    const media = new ls.LocalMedia(true, true);
                    await media.start()
                    onLocalMediaReady(media)

                    // open a connection up to the server
                    this.openUpstreamConnection(this.channel, media)

                    // listen for other remote participants to open a connection
                    this.channel.addOnRemoteUpstreamConnectionOpen((remoteConnectionInfo) => {
                        this.addConnection(remoteConnectionInfo)
                    })
                    // for connections that already exist when we joined, join them
                    this.channel.getRemoteUpstreamConnectionInfos().forEach(remoteConnectionInfo => {
                        this.addConnection(remoteConnectionInfo)
                    })

                    promise.resolve(null)
                    
                } catch (ex) {
                    promise.reject(ex)
                }
                return promise
            },
            openUpstreamConnection(channel, localMedia){
                const audioStream = (localMedia.getAudioTrack() != null) ? new ls.AudioStream(localMedia) : null;
                const videoStream = (localMedia.getVideoTrack() != null) ? new ls.VideoStream(localMedia) : null;
                const connection = channel.createSfuUpstreamConnection(audioStream, videoStream);
            
                connection.addOnStateChange(conn => {
                    if (conn.getState() == ls.ConnectionState.Failed) {
                        this.openUpstreamConnection(channel, localMedia);
                    }
                })
                connection.open();
                return connection;
            },
            async stopStreaming() {
                var promise = new ls.Promise()
                try {
                    await this.removeConnections()
                    await this.client.unregister()
                    promise.resolve(null)
                } catch (ex) {
                    promise.reject(ex)
                }
                return promise
            },
            async addConnection(info) {
                var promise = new ls.Promise();
                try {
                    // create a remote media/view for the downstream
                    var media = new ls.RemoteMedia()
                    var video = new ls.VideoStream(null, media)

                    // create the connection
                    var connection = this.channel.createSfuDownstreamConnection(info, video)

                    // store some meta-data with the connection
                    var record = {
                        id: info.getClientId(),
                        media: media,
                        video: video,
                        connection: connection
                    }
                    this.connectionRecords[connection.getId()] = record

                    // hook up some events
                    connection.addOnStateChange((c) => {
                        switch (c.getState()) {
                            case ls.ConnectionState.Connected:
                                onParticipantJoin(record)
                                break;
                            case ls.ConnectionState.Closed:
                            case ls.ConnectionState.Failed:
                                this.removeConnection(record)
                                onParticipantLeave(record)
                                break;
                        }
                    })
                                     
                    // open the connection
                    promise = connection.open()
                } catch (ex) {
                    console.error(ex)
                    promise.reject(ex)
                }
                return promise
            },
            /** Authenticates the user using the redirect method */
            async removeConnections() {
                var promises = []
                for (const [, record] of Object.entries(this.connectionRecords)) {
                    promises.push(this.removeConnection(record))
                }
                return Promise.all(promises)
            },
            async removeConnection(record) {
                var promise = new ls.Promise();
                try {
                    promise = record.connection.close();
                    delete this.connectionRecords[record.connection.getId()]
                } catch (ex) {
                    promise.reject(ex)
                }
                return promise
            }
        },
        async created() {
            this.startStreaming();
        }
    });

    return instance;
}

export const LiveSwitchPlugin = {
    install(Vue, options) {
      Vue.prototype.$liveswitch = useLiveSwitch(options);
    }
};