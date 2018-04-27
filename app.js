const fs = require( "fs-extra" );
const axios = require( "axios" );
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
	streaming: [],
};

let queue = [];
let queue_running = false;
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

	return new Promise( ( resolve, reject ) => {

		let data = Array( channels.length ).fill( {} );
		let remaining = channels.length;
		channels.forEach( ( channel, index ) => {

			// skip if channel is not enabled
			// skip if channel is not within update time
			if (
				! channel.enabled ||
				channel.last_update > ( +new Date() - channel.update_interval )
			) {
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

		let channel = channels[ index ];

		// error while retrieving channel from twitch
		if ( this_channel.error ) {
			channel.error = true;
			channel.last_error = channel.error_data;
			channel.consecutive_errors++;
			channel.last_update = +new Date();
		}
		// channel found, and is currently streaming
		else if ( this_channel.stream ) {
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

			channel.streaming.push({
				time: +new Date(),
				game: game_id,
			});
		}
		// channel found, and is not currently streaming
		else {
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


module.exports = {
	getChannels: getChannels,
	parseChannelData: parseChannelData,
	getGame: getGame,
	default_data_config: default_data_config,
	default_channel_config: default_channel_config,
};