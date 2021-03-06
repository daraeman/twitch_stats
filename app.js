const fs = require( "fs-extra" );
const axios = require( "axios" );
const path = require( "path" );
const app = require( "./app" );
require( "dotenv" ).config();
const twitchRequest = axios.create({
	baseURL: "https://api.twitch.tv/kraken/streams/",
	headers: { "Client-ID": process.env.TWITCH_CLIENT_ID },
	responseType: "json",
});
const default_data_config = {
	channels: [],
	games: [],
};
const default_channel_config = {
	name: null,
	update_interval: ( 10 * 60 * 1000 ),
	last_update: 0,
	enabled: true,
	error: false,
	last_error: null,
	consecutive_errors: 0,
};
const default_channel_data = {
	streaming: [],
};
const paths = {
	config: path.resolve( "data", "app" ),
	data: path.resolve( "data", "channels" ),
};
let queue = [];
let queue_running = false;
// api rate limit is 30 requests per minute
let queue_throttle = ( 2.1 * 1000 );
let last_queue_time = 0;

function addQueue( task ) {
	queue.push( task );
	if ( ! queue_running )
		processQueue();
}

function processQueue() {
	last_queue_time = +new Date();
	if ( queue.length ) {
		queue_running = true;
		let task = queue.shift();
		task()
			.then( () => {
				let throttle = ( last_queue_time < ( +new Date() - queue_throttle ) ) ? 0 : ( last_queue_time - ( +new Date() - queue_throttle ) );
				setTimeout( function() {
					processQueue();
				}, throttle );
			})
			.catch( ( error ) => {
				console.error( error );
				let throttle = ( last_queue_time < ( +new Date() - queue_throttle ) ) ? 0 : ( last_queue_time - ( +new Date() - queue_throttle ) );
				setTimeout( function() {
					processQueue();
				}, throttle );
			});
	}
	else {
		queue_running = false;
	}
}

function getChannels( channels ) {
	console.log( "getChannels", channels );

	return new Promise( ( resolve, reject ) => {

		if ( ! channels.length ) {
			return resolve( [] );
		}

		let data = Array( channels.length ).fill( {} );
		let remaining = channels.length;
		channels.forEach( ( channel, index ) => {

			// skip if channel is not enabled
			// skip if channel is not within update time
			if (
				! channel.enabled ||
				channel.last_update > ( +new Date() - channel.update_interval )
			) {
				console.log( "channel.last_update > ( +new Date() - channel.update_interval )", channel.last_update - ( +new Date() - channel.update_interval ) );
				console.log( "Skipping Channel:", channel.name );
				if ( --remaining < 1 )
					return resolve( data );
				else
					return;
			}

			console.log( "Fetching Channel:", channel.name );

			addQueue( function () {
				return new Promise( ( resolve2, reject2 ) => {
					console.log( "Sending Request" )
					// query twitch for channel data
					twitchRequest.get( channel.name )
						.then( ( response ) => {

							if ( response.code > 399 )
								throw new Error( "Invalid response code: " + JSON.stringify( response ) );

							data[ index ] = response.data;

							resolve2();

							if ( --remaining < 1 )
								return resolve( data );

						})
						.catch( ( error ) => {

							data[ index ] = {
								name: channel.name,
								error: true,
								error_data: error,
							};

							resolve2();

							if ( --remaining < 1 )
								return resolve( data );

						});
				});
			});

		});
	});
}

function parseChannelData( data, channel_data ) {

	let channels = data.channels;
	let games = data.games;

	channel_data.forEach( ( this_channel, index ) => {

		// channel was skipped
		if ( ! Object.keys( this_channel ).length ) {
			console.log( "channel skipped" );
			return;
		}

		let channel = channels[ index ];

		console.log( "channel", channel.name );
		console.log( "this_channel", this_channel );

		// error while retrieving channel from twitch
		if ( this_channel.error ) {
			console.log( "channel a" );
			channel.error = true;
			channel.last_error = channel.error_data;
			channel.consecutive_errors++;
			channel.last_update = +new Date();
		}
		// channel found, and is currently streaming
		else if ( this_channel.stream ) {
			console.log( "channel b" );
			channel.error = false;
			channel.last_error = channel.error_data;
			channel.consecutive_errors = 0;
			channel.last_update = +new Date();

			// get game id
			let game_id = getGame( games, this_channel.stream.game );

			// if doesn't exist create it, reassign games and re-get game id
			if ( game_id === false ) {
				games = addGame( games, this_channel.stream.game );
				game_id = getGame( games, this_channel.stream.game );
			}

			getChannelData( channel.name )
				.then( ( channel_data ) => {

					channel_data = JSON.parse( channel_data );

					channel_data.streaming.push({
						time: +new Date(),
						game: game_id,
						viewers: this_channel.stream.viewers,
					});

					return saveChannelData( channel.name, channel_data );
				});
		}
		// channel found, and is not currently streaming
		else {
			console.log( "channel d" );
			channel.error = false;
			channel.last_error = channel.error_data;
			channel.consecutive_errors = 0;
			channel.last_update = +new Date();
		}
	});

	data.channels = channels;
	data.games = games;

	return data;

}

function getGame( games, game_name ) {

	let game_index = games.indexOf( game_name );

	if ( game_index === -1 )
		return false;

	return game_index;

}

function addGame( games, game_name ) {

	games.push( game_name );

	return games;
}

function channelDataPath( channel_name ) {
	return path.resolve( paths.data, channel_name + ".json" );
}

function configPath() {
	return path.resolve( paths.config, "channels.json" );
}

function saveChannelData( channel_name, data ) {
	console.log( "channelDataPath( channel_name )", channelDataPath( channel_name ) )
	return fs.writeFile( channelDataPath( channel_name ), JSON.stringify( data ), "utf8" );
}

function getChannelData( channel_name ) {
	return fs.readFile( channelDataPath( channel_name ), "utf8" );
}

function getConfig() {

	return new Promise( ( resolve, reject ) => {

		let path = configPath();

		fs.stat( path )
			.catch( ( error ) => {
				console.log( "no config file, creating" )
				// create if it doesn't
				fs.writeFile( path, JSON.stringify( default_data_config ), "utf8" );
			})
			.then( () => {
				// get the config file
				return fs.readFile( path, "utf8" );
			})
			.then( ( json ) => {
				// parse the config file
				if ( ! json ) {
					console.log( "no json, using config" )
					return default_data_config;
				}
				return JSON.parse( json );
			})
			.then( ( parsed_data ) => {
				data = parsed_data;
			});

	});
}

function getConfig() {
	return new Promise( ( resolve, reject ) => {

		fs.readFile( configPath(), "utf8" )
			.then( ( json ) => {
				if ( ! json )
					return app.default_data_config;
				return JSON.parse( json );
			})
			.then( ( data ) => {
				return resolve( data );
			});
	});
}

/* - - - - - Exports - - - - - */

module.exports = {
	getChannels: getChannels,
	parseChannelData: parseChannelData,
	getGame: getGame,
	default_data_config: default_data_config,
	default_channel_config: default_channel_config,
	default_channel_data: default_channel_data,
	channelDataPath: channelDataPath,
	configPath: configPath,
	default_channel_data: default_channel_data,
	saveChannelData: saveChannelData,
	getChannelData: getChannelData,
	getConfig: getConfig,
	paths: paths,
};