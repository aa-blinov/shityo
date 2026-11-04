import {error} from '@sveltejs/kit';
import {library} from '$lib/library';
import type {PageLoad} from './$types';
export const load:PageLoad=({params})=>{
 const pattern=library.find(p=>p.id===params.id);
 if(!pattern)error(404,'Pattern not found');
 return {pattern};
};
