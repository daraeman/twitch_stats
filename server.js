const express = require( "express" );
const app = express();
const path = require( "path" );
const handlebars = require( "express-handlebars" );
require( "dotenv" ).config();
const Stream = require( "./app" );

app.engine( "handlebars", handlebars() );
app.set( "view engine", "handlebars" );

app.get( "/", ( request, response ) => {

	Stream.getConfig()
		.then( ( data ) => {
			console.log( "data", data )
			response.render( "channel_list", {
				channels: data.channels,
			});
		});
});

app.get( "/channel/:name", ( request, response ) => {

	let name = request.params.name;

	Stream.getConfig()
		.then( ( data ) => {

			let channel = data.channels.filter( ( channel ) => {
				return ( channel.name === name );
			});

			if ( ! channel )
				return response.redirect( "/" );

			return response.render( "channel_view", {
				name: name,
			});

		});
});

app.listen( process.env.BACKEND_PORT );