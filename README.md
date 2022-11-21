# multimatic-influxdb

A [macchina.io EDGE](https://github.com/macchina-io/macchina.io) script for writing heatpump
data from a Vaillant multiMATIC control to InfluxDB.

This script obtains heatpump data via the Vaillant multiMATIC app API and writes some
parameters to an InfluxDB database.

The used API endpoints have been obtained from [Thomas Germain](https://github.com/thomasgermain)'s
[pymultiMATIC](https://github.com/thomasgermain/pymultiMATIC) Python package.

## Legal Disclaimer

This software is not affiliated with Vaillant and the developers take no legal
responsibility for the functionality or security of your Vaillant devices.
