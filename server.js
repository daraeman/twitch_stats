const express = require( "express" );
const app = express();
const path = require( "path" );
const handlebars = require( "express-handlebars" );
require( "dotenv" ).config();
const Stream = require( "./app" );
const moment = require( "moment" );

app.engine( "handlebars", handlebars() );
app.set( "view engine", "handlebars" );

app.get( "/", ( request, response ) => {

	Stream.getConfig()
		.then( ( data ) => {
			response.render( "channel_list", {
				channels: data.channels,
			});
		});
});

app.get( "/channel/:name", ( request, response ) => {

	let name = request.params.name;

	const fudge_time = ( 2 * 60 * 1000 );
	const block_template = {
		start: null,
		end: null,
		game: null,
	};
	let channel_config = null;
	let games = null;

	Stream.getConfig()
		.then( ( all_configs ) => {

			channel_config = all_configs.channels.filter( ( channel ) => {
				return ( channel.name === name );
			})[0];

			games = all_configs.games;

			return Stream.getChannelData( name );

		})
		.then( ( channel_data ) => {

			let data = JSON.parse( channel_data );
			let last_time = 0;
			let blocks = [];
			let this_block = Object.assign( {}, block_template );
			data.streaming.forEach( ( stream, index ) => {

				// game changed or stream block is different                               
				if ( ( ( stream.time - last_time ) > ( channel_config.update_interval + fudge_time ) || this_block.game !== stream.game ) && this_block.start ) {
					this_block.end = last_time;
					blocks.push( this_block );
					this_block = Object.assign( {}, block_template );
					this_block.start = stream.time;
					this_block.game = stream.game;
				}
				// same stream
				else {

					if ( ! this_block.start ) {
						this_block.start = stream.time;
						this_block.game = stream.game;
					}

					if ( ( index + 1 ) === data.streaming.length ) {
						this_block.end = stream.time;
						blocks.push( this_block );
					}

				}

				last_time = stream.time;
			});

			blocks = blocks.map( ( block ) => {
				block.duration = ( ( block.end - block.start ) / 1000 / 60 / 60 ).toFixed( 2 ) + " hours";
				block.start = moment( block.start, "x" ).format( "ddd MMMM Do, YYYY" );
				block.game = games[ block.game ];
				return block;
			});

			return response.render( "channel_view", {
				name: name,
				blocks: blocks,
			});

		});
});

app.get( "/api/channel/:name", ( request, response ) => {

	let name = request.params.name;

	response.sendFile( path.resolve( Stream.paths.data, name ) + ".json" );

});

app.get( "/api/games", ( request, response ) => {

	Stream.getConfig()
		.then( ( data ) => {
			response.json( data.games );
		});

});

app.get( "/api/config/channel/:name", ( request, response ) => {

	let name = request.params.name;

	Stream.getConfig()
		.then( ( data ) => {

			let channel_config = data.channels.filter( ( channel ) => {
				return ( channel.name === name );
			});

			response.json( channel_config[0] );
		});

});

app.listen( process.env.BACKEND_PORT );