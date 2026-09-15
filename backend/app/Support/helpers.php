<?php

function safe($v){return is_object($v)&&method_exists($v,'toArray')?$v->toArray():$v;}
