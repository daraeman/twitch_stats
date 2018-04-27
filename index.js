const fs = require( "fs-extra" );
const path = require( "path" );
const app = require( "./app" );
const paths = {
	config: path.resolve( "data", "app" ),
};
const channel_config_file = path.resolve( paths.config, "channels.js" );

let data;
// check config file exists
fs.stat( channel_config_file )
	.catch( ( error ) => {
		// create if it doesn't
		fs.writeFile( channel_config_file, JSON.stringify( app.default_data_config ), "utf8" );
	})
	.then( () => {
		// get the config file
		return fs.readFile( channel_config_file, "utf8" );
	})
	.then( ( json ) => {
		// parse config file
		return JSON.parse( json );
	})
	.then( ( parsed_data ) => {
		data = parsed_data;
		// query twitch for all data from channels that need updating
		return app.getChannels( data.channels );
	})
	.then( ( channel_data ) => {
		return app.parseChannelData( data, channel_data );
	})
	.then( ( updated_channel_data ) => {
		//data.channels = updated_channel_data;
		return fs.writeFile( channel_config_file, JSON.stringify( data ), "utf8" );
	})
	.then( () => {
		console.log( "Done" );
	});