# Vue: Video Streaming #
*By Jerod Venema*
This tutorial demonstrates how to add video streaming to a VueJS application using LiveSwitch. 

We recommend that you [log in](https://console.liveswitch.io) to follow this quickstart with examples configured for your account.

`System requirements: Vue 2.6.11 | Vue CLI 4.2.2`

## Option 1: Quick Start
Want to get started right this second? Here is the quick version in three steps:

**Step 1**: Check out this repository
```bash
git clone https://github.com/jerodvenemafm/getting-started-vuejs
cd getting-started-vuejs
npm init
```

**Step 2**: Update `./liveswitch_config.json` with your Application ID and Shared Secret from [console.liveswitch.io](https://console.liveswitch.io/#/applications)
```bash
{
    "applicationId": "-your-application-id-goes-here-",
    "channelId": "/room/1",
    "sharedSecret": "-your-shared-secret-goes-here-"
}
```
(See "Set up your LiveSwitch Application" below for more info if you need it!)

**Step 3**: Run the app!
```bash
npm run serve
```

That's it! Open 2 copies of the page to see yourself streaming in both directions. For a more detailed setup, please read on.

> New to video streaming? Learn [how LiveSwitch works](https://developer.liveswitch.io/liveswitch-cloud/get-started/intro.html), how it integrates with Single-Page Applications and which protocols it uses.


## Option 2: Walkthrough ##
This section will guide you step-by-step through the process of building the application outlined above. Here we go!


### Get Your Application ID and Secret ###
When you signed up for LiveSwitch, a new application was created for you (or you could have created a new one). You will need some details about that application to communicate with LiveSwitch. You can get these details from the [Applications section in the LiveSwitch console](https://console.liveswitch.io/#/applications). 

First, go to the application list view:

![Application List](https://i.imgur.com/7Zbf2NY.png)
<div align="center"><em>Application List</em></div>

Next, select your application from the Application List to view its details:

![Default Application](https://i.imgur.com/cpmYBWo.png)
<div align="center"><em>Application Settings</em></div>

From this detail view, you will need the Application ID and Shared Secret

## Create a Sample Application ##
> The following tutorial creates a new Vue application using the Vue CLI, and presents some common ways to build Vue applications, in terms of its structure and naming conventions. If you are using this guide to integrate the LiveSwitch SDK into your Vue application, you may need to adjust some of the steps to suit your scenario.

If you don't already have an existing application, you can create one using the [Vue CLI](https://cli.vuejs.org/guide/) tool. Using the terminal, find a location on your drive where you want to create the project and run the following commands:

```bash
# Install the CLI
npm install -g @vue/cli

# Create the application using the Vue CLI.
# These presets can be modified for your app as needed, but will work for this example
vue create --inlinePreset='{ "useConfigFiles": false, "plugins": { "@vue/cli-plugin-babel": {}, "@vue/cli-plugin-eslint": { "config": "base", "lintOn": ["save"] } }, "router": true, "routerHistoryMode": true }' my-app

# Move into the project directory
cd my-app

# Start the application
npm run serve
```

### Install the SDK ###

After creating a new Vue app using the CLI, install the [LiveSwitch Client SDK](https://www.npmjs.com/package/fm.liveswitch):

```bash
npm install fm.liveswitch
```

At this point, you can leave the application running in the background, as it will reload whenever you make changes.

## Create a LiveSwitch/Vue Plugin ##
The best way to manage and coordinate the tasks necessary for streaming video is to create a reusable bridge between LiveSwitch and Vue. In this sample, this bridge is implemented as a Vue plugin. Doing this makes it much easier to work with the asynchronous methods of the LiveSwitch SDK, thanks to the reactive nature of Vue.

This code also implements a simple Vue plugin that exposes this plugin to the rest of the application.

To implement the plugin, create a new folder called `liveswitch` inside the `src` folder, and then create a new file called `index.js` inside. Populate this file with the following content:

> The intention is for the following code snippet and the associated Vue plugin to be refactored into a separate dependency, to be installed as a dependency of your project. For now, add the code inline into your project.

```js

import Vue from 'vue';
import ls from 'fm.liveswitch';

let instance;

export const getInstance = () => instance;

export const useLiveSwitch = ({

    applicationId = '-specify-in-liveswitch_config.json',
    token = '',
    gatewayUrl = 'https://cloud.liveswitch.io',
    // callback for when your local camera/mic are up and running 
    onLocalMediaReady = function(){},
    // callback for when a user joins
    onParticipantJoin = function(){},
    // callback for when a user leaves
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
```

The options object passed to the plugin is used to provide the registration token and application id. For this example, create a new file `liveswitch_config.json` in the root directory of the application alongside your `package.json` file, and populate it with the values from your application created above:


(TODO: make this dynamic!)
> [Log In](https://console.liveswitch.io) to configure this snippet with your account details
```js
{
    "applicationId": "YOUR_APPLICATION_ID",
    "channelId": "/room/1",
    "sharedSecret": "YOUR_SHARED_SECRET"
}
```


## Rendering the video ##

At this point, your app should prompt you for access to your microphone and webcam, and should be able to successfully register with and stream to the LiveSwitch servers. Next up, we have to render the video feeds. There are two video "types" we have to deal with - local and remote. Local refers to your own webcam, while remote refers to other participants. They are handled differently because most often the UI for these two participant types is different.

In a production application, we will use the `LayoutManager` class, which dynamically manages the video elements to maximize the space on the page in an appropriate manner for set of video feeds (more on why this is useful later). For the purposes of this example, however, we will force the video layout to be a simple auto height/width/position. 

Edit `App.vue` and append the following to the `<style>` block at the bootom of the file:
```css
video{
  width:auto !important;
  height:auto !important;
  position:relative !important;
}
```

## Installing and using the plugin ##
Finally, open `src/main.js` and use `Vue.use` to install the plugin. To do this, we need to pass in a small number of properties in to the plugin. They are:

1. The token, generated using your configuration file
2. 3 callbacks, one for your local camera, and two more for when a user joins or leaves
3. Your application ID

Your final `src/main.js` should look like roughly like the following example

```js
import Vue from 'vue'
import App from './App.vue'
import router from './router'
import ls from 'fm.liveswitch';

Vue.config.productionTip = false

// Import the LiveSwitch configuration
import { applicationId, channelId, sharedSecret } from "../liveswitch_config.json";

// Import the plugin here
import { LiveSwitchPlugin } from "./liveswitch";

// generate a token that will let us connect to the server
// we use the values from the config here. In general, you should
// put this behind a service that is properly authenticated and 
// only allow access to the appropriate channels based on the
// authenticated user's permissions in your application
const token = ls.Token.generateClientRegisterToken(applicationId, null, null, null, null, [new ls.ChannelClaim(channelId)], sharedSecret);

// a few handlers
// in your production application, these handlers should
// store the media/record objects in a reactive VueX store
// where all your sub-components can access/react to them
const onLocalMediaReady = function(media){
  var home = document.getElementsByClassName('home')[0];
  home.insertBefore(media.getView(), home.firstChild)
}

const onParticipantJoin = function(record){
  var home = document.getElementsByClassName('home')[0];
  home.insertBefore(record.media.getView(), home.firstChild)
}

const onParticipantLeave = function(record){
  var home = document.getElementsByClassName('home')[0];
  home.removeChild(record.media.getView())
}

// Install the LiveSwitch plugin here
Vue.use(LiveSwitchPlugin, {
  applicationId,
  token,
  onLocalMediaReady,
  onParticipantJoin,
  onParticipantLeave
});

// normal vue stuff
new Vue({
  router,
  render: h => h(App)
}).$mount('#app')
```

Notice that the configuration file created earlier has been imported and used to initialize the plugin, and we are generating a token using that information. By taking this approach, your shared secret is never exposed to the outside world, and you can restrict access based on your application requirements.

That's it! Your app is up and running. To learn more, check out our documentation at [https://developer.liveswitch.io/](https://developer.liveswitch.io/)
