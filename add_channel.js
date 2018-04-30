const fs = require( "fs-extra" );
const app = require( "./app" );
const channel_config_file = app.configPath();
const new_channel_name = process.argv[2];
console.log( "new_channel_name", new_channel_name )
const channel_data_path = app.channelDataPath( new_channel_name );
console.log( "channel_data_path", channel_data_path )

if ( process.argv.length < 3 ) {
	console.log( "Please enter a channel name to add." );
	process.exit();
}

// check config file exists
fs.stat( channel_config_file )
	.catch( ( error ) => {
		console.log( "no config file, creating" )
		// create if it doesn't
		fs.writeFile( channel_config_file, JSON.stringify( app.default_data_config ), "utf8" );
	})
	.then( () => {
		console.log( "reading config file" )
		// get the config file
		return fs.readFile( channel_config_file, "utf8" );
	})
	.then( ( json ) => {
		// parse the config file
		console.log( "json", json )
		if ( ! json ) {
			console.log( "no json, using config" )
			return app.default_data_config;
		}
		console.log( "using json" )
		return JSON.parse( json );
	})
	.then( ( data ) => {
		let channel = data.channels.filter( channel => channel.name === new_channel_name );
		if ( ! channel || ! channel.length ) {
			channel = app.default_channel_config;
			channel.name = new_channel_name;
			data.channels.push( channel );
		}
		return data;
	})
	.then( ( data ) => {
		return fs.writeFile( channel_config_file, JSON.stringify( data ), "utf8" );
	})
	.then( () => {
		return fs.stat( channel_data_path );
	})
	.catch( ( error ) => {
		console.log( "creating channel data file" );
		return fs.writeFile( channel_data_path, JSON.stringify( app.default_channel_data ), "utf8" );
	})
	.then( () => {
		console.log( "Done" );
	});